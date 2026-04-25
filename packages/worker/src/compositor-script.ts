/**
 * Inline worker script implementing a simplified compositor.
 *
 * This string is turned into a Blob URL at runtime so no separate
 * worker file is needed. It cannot use ES module imports since it
 * runs inside a classic Worker created from a Blob.
 *
 * @module
 */

/**
 * JavaScript source of the inline compositor worker.
 *
 * The string is wrapped in a `Blob` at runtime and fed to the
 * `Worker(url)` constructor, so this package ships without a separate
 * worker entry file or bundler glue. Keep this source ES5-compatible:
 * it runs inside a classic Worker and cannot use ES module imports.
 */
export const COMPOSITOR_WORKER_SCRIPT = /* js */ `
"use strict";

// ---------------------------------------------------------------------------
// Simplified compositor state inside the worker
// ---------------------------------------------------------------------------

/** @type {Map<string, { id: string; states: string[]; thresholds: number[]; currentState: string; currentGeneration: number; cssKey: string|null; glslKey: string|null; ariaKey: string|null; oneHotWeights: Record<string, Record<string, number>>|null; _keysResolved: boolean }>} */
const quantizers = new Map();

/** @type {Map<string, Record<string, number>>} */
const blendOverrides = new Map();

/** @type {Set<string>} */
const dirtyNames = new Set();

const MS_PER_SEC = 1000;

/** @type {number} */
let lastComputeTime = 0;
let frameCount = 0;
let fpsAccum = 0;
let currentFps = 0;

function removeQuantizer(name) {
  quantizers.delete(name);
  blendOverrides.delete(name);
  dirtyNames.delete(name);
}

function evaluateQuantizer(name, value) {
  const q = quantizers.get(name);
  if (q) {
    const newState = evaluateThresholds(q.thresholds, q.states, value);
    if (newState !== q.currentState) {
      q.currentState = newState;
      dirtyNames.add(name);
    }
  }
}

function setBlendWeights(name, weights) {
  blendOverrides.set(name, weights);
  dirtyNames.add(name);
}

function applyResolvedStateEntry(entry) {
  const q = quantizers.get(entry.name);
  if (!q) {
    return;
  }

  const nextGeneration = typeof entry.generation === "number" ? entry.generation : q.currentGeneration;
  const changed = entry.state !== q.currentState || nextGeneration !== q.currentGeneration;
  q.currentState = entry.state;
  q.currentGeneration = nextGeneration;
  if (changed) {
    dirtyNames.add(entry.name);
  }
}

function applyUpdate(update) {
  switch (update.type) {
    case "remove-quantizer":
      removeQuantizer(update.name);
      break;
    case "evaluate":
      evaluateQuantizer(update.name, update.value);
      break;
    case "set-blend":
      setBlendWeights(update.name, update.weights);
      break;
  }
}

function registerQuantizer(registration) {
  const initialState =
    typeof registration.initialState === "string"
      ? registration.initialState
      : registration.states[0] || "";
  const thresholdsRaw = registration.thresholds;
  const thresholds = thresholdsRaw instanceof Float64Array
    ? Array.from(thresholdsRaw)
    : Array.from(thresholdsRaw);
  quantizers.set(registration.name, {
    id: registration.boundaryId,
    states: Array.from(registration.states),
    thresholds: thresholds,
    currentState: initialState,
    currentGeneration: 0,
    cssKey: null,
    glslKey: null,
    ariaKey: null,
    oneHotWeights: null,
    _keysResolved: false,
  });
  if (registration.blendWeights && typeof registration.blendWeights === "object") {
    blendOverrides.set(registration.name, registration.blendWeights);
  } else {
    blendOverrides.delete(registration.name);
  }
  dirtyNames.add(registration.name);
}

function resolveOutputKeys(q, name) {
  if (q._keysResolved) return;
  q.cssKey = "--czap-" + name;
  q.glslKey = "u_" + name;
  q.ariaKey = "data-czap-" + name;
  q.oneHotWeights = Object.fromEntries(
    q.states.map((activeState) => [
      activeState,
      Object.fromEntries(
        q.states.map((stateName) => [stateName, stateName === activeState ? 1 : 0]),
      ),
    ]),
  );
  q._keysResolved = true;
}

function resetWorkerState() {
  quantizers.clear();
  blendOverrides.clear();
  dirtyNames.clear();
}

/**
 * Evaluate which discrete state a value falls into based on thresholds.
 * Thresholds are sorted ascending; the value maps to the state whose
 * threshold it first exceeds (or the first state if below all thresholds).
 *
 * @param {number[]} thresholds
 * @param {string[]} states
 * @param {number} value
 * @returns {string}
 */
function evaluateThresholds(thresholds, states, value) {
  for (let i = thresholds.length - 1; i >= 0; i--) {
    if (value >= thresholds[i]) {
      return states[i] || states[0] || "";
    }
  }
  return states[0] || "";
}

/**
 * Build a CompositeState from the current quantizer state.
 * @returns {{ discrete: Record<string, string>; blend: Record<string, Record<string, number>>; outputs: { css: Record<string, number|string>; glsl: Record<string, number>; aria: Record<string, string> } }}
 */
function compute() {
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();

  const discrete = {};
  const blend = {};
  const css = {};
  const glsl = {};
  const aria = {};
  const resolvedStateGenerations = {};

  // Only recompute dirty quantizers if we have a dirty set,
  // otherwise recompute all (initial case or fallback).
  const names = dirtyNames.size > 0
    ? Array.from(dirtyNames)
    : Array.from(quantizers.keys());

  for (const name of names) {
    const q = quantizers.get(name);
    if (!q) continue;

    // Lazily resolve output keys on first compute
    resolveOutputKeys(q, name);

    const stateStr = q.currentState;
    discrete[name] = stateStr;
    resolvedStateGenerations[name] = q.currentGeneration;

    // Blend weights
      const override = blendOverrides.get(name);
      if (override !== undefined) {
        blend[name] = override;
      } else {
        blend[name] = q.oneHotWeights[stateStr] || {};
      }

      // CSS output
      css[q.cssKey] = stateStr;

    // GLSL output: index of current state
    let stateIndex = 0;
    for (let i = 0; i < q.states.length; i++) {
      if (q.states[i] === stateStr) {
        stateIndex = i;
        break;
      }
    }
      glsl[q.glslKey] = stateIndex;

      // ARIA output
      aria[q.ariaKey] = stateStr;
  }

  dirtyNames.clear();

  // Metrics
  if (lastComputeTime > 0) {
    const dt = now - lastComputeTime;
    frameCount++;
    fpsAccum += dt;
    if (fpsAccum >= MS_PER_SEC) {
      currentFps = Math.round((frameCount * MS_PER_SEC) / fpsAccum);
      frameCount = 0;
      fpsAccum -= MS_PER_SEC;

      self.postMessage({
        type: "metrics",
        fps: currentFps,
        budgetUsed: dt,
      });
    }
  }
  lastComputeTime = now;

  return { discrete, blend, outputs: { css, glsl, aria }, resolvedStateGenerations };
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

self.addEventListener("message", function (e) {
  const msg = e.data;
  if (!msg || typeof msg.type !== "string") return;

  switch (msg.type) {
    case "init": {
      // Reset state on init
      resetWorkerState();
      self.postMessage({ type: "ready" });
      break;
    }

    case "add-quantizer": {
      registerQuantizer(msg);
      break;
    }

    case "bootstrap-quantizers": {
      for (const registration of msg.registrations) {
        registerQuantizer(registration);
      }
      break;
    }

    case "startup-compute": {
      resetWorkerState();
      const packet = msg.packet ?? { registrations: [], updates: [] };
      for (const registration of packet.registrations) {
        registerQuantizer(registration);
      }
      for (const update of packet.updates) {
        applyUpdate(update);
      }
      try {
        const state = compute();
        self.postMessage({ type: "state", state: state, resolvedStateGenerations: state.resolvedStateGenerations });
      } catch (err) {
        self.postMessage({
          type: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
      break;
    }

    case "bootstrap-resolved-state": {
      for (const entry of msg.states) {
        applyResolvedStateEntry(entry);
      }
      if (msg.ack === true) {
        self.postMessage({
          type: "resolved-state-ack",
          generation: typeof msg.states[0]?.generation === "number" ? msg.states[0].generation : 0,
          states: msg.states.map((entry) => ({ name: entry.name, state: entry.state })),
          additionalOutputsChanged: false,
        });
      }
      break;
    }

    case "apply-resolved-state": {
      for (const entry of msg.states) {
        applyResolvedStateEntry(entry);
      }
      if (msg.ack === true) {
        self.postMessage({
          type: "resolved-state-ack",
          generation: typeof msg.states[0]?.generation === "number" ? msg.states[0].generation : 0,
          states: msg.states.map((entry) => ({ name: entry.name, state: entry.state })),
          additionalOutputsChanged: false,
        });
      }
      break;
    }

    case "remove-quantizer": {
      removeQuantizer(msg.name);
      break;
    }

    case "evaluate": {
      evaluateQuantizer(msg.name, msg.value);
      break;
    }

    case "set-blend": {
      setBlendWeights(msg.name, msg.weights);
      break;
    }

    case "apply-updates": {
      for (const update of msg.updates) {
        applyUpdate(update);
      }
      break;
    }

    case "warm-reset": {
      blendOverrides.clear();
      dirtyNames.clear();
      for (const quantizer of quantizers.values()) {
        quantizer.currentState = quantizer.states[0] || "";
      }
      break;
    }

    case "compute": {
      try {
        const state = compute();
        self.postMessage({ type: "state", state: state, resolvedStateGenerations: state.resolvedStateGenerations });
      } catch (err) {
        self.postMessage({
          type: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
      break;
    }

    case "dispose": {
      resetWorkerState();
      self.close();
      break;
    }
  }
});
`;
