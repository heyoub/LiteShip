/**
 * RenderWorker -- off-main-thread video renderer using OffscreenCanvas.
 *
 * The render worker:
 * 1. Receives an OffscreenCanvas via postMessage transfer
 * 2. On `start-render`, iterates frames at the configured fps
 * 3. For each frame, computes state (simplified inline compositor)
 *    and draws to the OffscreenCanvas 2d context
 * 4. Posts `frame` messages back with VideoFrameOutput data
 * 5. Posts `render-complete` when done
 *
 * The worker script is inlined as a Blob URL (no separate file needed).
 *
 * @module
 */

import { Diagnostics, type VideoConfig, type VideoFrameOutput } from '@czap/core';
import type { ToWorkerMessage, FromWorkerMessage } from './messages.js';
import { EVALUATE_THRESHOLDS_SOURCE } from './evaluate-inline.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Host-facing surface of a render worker. Owns the underlying `Worker`
 * and `OffscreenCanvas` once transferred; created by
 * {@link RenderWorker.create}.
 */
export interface RenderWorkerShape {
  /** The underlying Worker instance. */
  readonly worker: Worker;

  /**
   * Transfer an OffscreenCanvas to the worker.
   * The canvas must have been obtained via `canvas.transferControlToOffscreen()`.
   */
  transferCanvas(canvas: OffscreenCanvas): void;

  /** Start rendering frames with the given video configuration. */
  startRender(config: VideoConfig): void;

  /** Stop an in-progress render. */
  stopRender(): void;

  /** Subscribe to per-frame output. Returns an unsubscribe function. */
  onFrame(callback: (output: VideoFrameOutput) => void): () => void;

  /** Subscribe to render completion. Returns an unsubscribe function. */
  onComplete(callback: (totalFrames: number) => void): () => void;

  /** Terminate the worker and clean up resources. */
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Inline worker script
// ---------------------------------------------------------------------------

/**
 * Self-contained render worker script.
 *
 * Contains a minimal compositor and frame iterator that draws state
 * visualization to an OffscreenCanvas.
 */
const RENDER_WORKER_SCRIPT = /* js */ `
"use strict";

/** @type {OffscreenCanvas | null} */
let canvas = null;

/** @type {OffscreenCanvasRenderingContext2D | null} */
let ctx = null;

/** @type {boolean} */
let rendering = false;

/** @type {boolean} */
let stopRequested = false;

// ---------------------------------------------------------------------------
// Simplified inline compositor (mirrors compositor-worker / Boundary.evaluate)
// ---------------------------------------------------------------------------

/** @type {Map<string, { id: string; states: string[]; thresholds: number[]; currentState: string }>} */
const quantizers = new Map();

/** @type {Map<string, Record<string, number>>} */
const blendOverrides = new Map();

${EVALUATE_THRESHOLDS_SOURCE}

/**
 * Compute a CompositeState from the current quantizer state.
 */
function computeState() {
  const discrete = {};
  const blend = {};
  const css = {};
  const glsl = {};
  const aria = {};

  for (const [name, q] of quantizers) {
    const stateStr = q.currentState;
    discrete[name] = stateStr;

    const override = blendOverrides.get(name);
    if (override !== undefined) {
      blend[name] = override;
    } else {
      const weights = {};
      for (const s of q.states) {
        weights[s] = s === stateStr ? 1 : 0;
      }
      blend[name] = weights;
    }

    css["--czap-" + name] = stateStr;

    let stateIndex = 0;
    for (let i = 0; i < q.states.length; i++) {
      if (q.states[i] === stateStr) {
        stateIndex = i;
        break;
      }
    }
    glsl["u_" + name] = stateIndex;
    aria["data-czap-" + name] = stateStr;
  }

  return { discrete, blend, outputs: { css, glsl, aria } };
}

// ---------------------------------------------------------------------------
// Canvas rendering
// ---------------------------------------------------------------------------

/**
 * Draw the current CompositeState to the OffscreenCanvas.
 * This is a diagnostic visualization; real applications would
 * implement domain-specific rendering.
 *
 * @param {{ discrete: Record<string, string>; blend: Record<string, Record<string, number>>; outputs: { css: Record<string, number|string>; glsl: Record<string, number>; aria: Record<string, string> } }} state
 * @param {number} frame
 * @param {number} progress
 */
function drawState(state, frame, progress) {
  if (!ctx || !canvas) return;

  const w = canvas.width;
  const h = canvas.height;

  // Clear
  ctx.clearRect(0, 0, w, h);

  // Background: gradient based on progress
  const gray = Math.round(32 + progress * 32);
  ctx.fillStyle = "rgb(" + gray + "," + gray + "," + gray + ")";
  ctx.fillRect(0, 0, w, h);

  // Draw discrete state labels
  ctx.fillStyle = "#ffffff";
  ctx.font = "14px monospace";
  ctx.textBaseline = "top";

  let y = 16;
  const keys = Object.keys(state.discrete);
  for (let i = 0; i < keys.length; i++) {
    const name = keys[i];
    const value = state.discrete[name];
    ctx.fillText(name + ": " + value, 16, y);
    y += 20;
  }

  // Draw progress bar
  const barY = h - 24;
  const barH = 8;
  ctx.fillStyle = "#333333";
  ctx.fillRect(16, barY, w - 32, barH);
  ctx.fillStyle = "#4488ff";
  ctx.fillRect(16, barY, (w - 32) * progress, barH);

  // Frame counter
  ctx.fillStyle = "#aaaaaa";
  ctx.font = "12px monospace";
  ctx.textBaseline = "bottom";
  ctx.fillText("frame " + frame, 16, barY - 4);
}

// ---------------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------------

/**
 * Run the fixed-step render loop.
 * @param {{ fps: number; width: number; height: number; durationMs: number }} config
 */
async function runRender(config) {
  if (rendering) return;
  rendering = true;
  stopRequested = false;

  const totalFrames = Math.ceil((config.durationMs / 1000) * config.fps);

  try {
    for (let i = 0; i < totalFrames; i++) {
      if (stopRequested) break;

      const timestamp = (i * 1000) / config.fps;
      const progress = totalFrames > 1 ? i / (totalFrames - 1) : 1;
      const state = computeState();

      // Draw to canvas
      drawState(state, i, progress);

      /** @type {import('./messages.js').VideoFrameOutput} */
      const output = { frame: i, timestamp, progress, state };

      self.postMessage({ type: "frame", output: output });

      // Yield to allow stop messages to be processed.
      // In a real scenario, the frame rate would be controlled by
      // the encoding pipeline; here we use a minimal yield.
      if (i % 10 === 9) {
        await new Promise(function (r) { setTimeout(r, 0); });
      }
    }

    self.postMessage({ type: "render-complete", totalFrames: totalFrames });
  } catch (err) {
    self.postMessage({
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  } finally {
    rendering = false;
  }
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

self.addEventListener("message", function (e) {
  const msg = e.data;
  if (!msg || typeof msg.type !== "string") return;

  switch (msg.type) {
    case "init": {
      quantizers.clear();
      blendOverrides.clear();
      self.postMessage({ type: "ready" });
      break;
    }

    case "transfer-canvas": {
      canvas = msg.canvas;
      ctx = canvas.getContext("2d");
      break;
    }

    case "add-quantizer": {
      const initialState = msg.states[0] || "";
      quantizers.set(msg.name, {
        id: msg.boundaryId,
        states: Array.from(msg.states),
        thresholds: Array.from(msg.thresholds),
        currentState: initialState,
      });
      break;
    }

    case "remove-quantizer": {
      quantizers.delete(msg.name);
      blendOverrides.delete(msg.name);
      break;
    }

    case "evaluate": {
      const q = quantizers.get(msg.name);
      if (q) {
        q.currentState = evaluateThresholds(q.thresholds, q.states, msg.value);
      }
      break;
    }

    case "set-blend": {
      blendOverrides.set(msg.name, msg.weights);
      break;
    }

    case "start-render": {
      runRender(msg.config);
      break;
    }

    case "stop-render": {
      stopRequested = true;
      break;
    }

    case "dispose": {
      stopRequested = true;
      quantizers.clear();
      blendOverrides.clear();
      canvas = null;
      ctx = null;
      self.close();
      break;
    }
  }
});
`;

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

function _send(worker: Worker, msg: ToWorkerMessage, transfer?: Transferable[]): void {
  if (transfer && transfer.length > 0) {
    worker.postMessage(msg, transfer);
  } else {
    worker.postMessage(msg);
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

function _createRenderWorker(): RenderWorkerShape {
  const blob = new Blob([RENDER_WORKER_SCRIPT], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);
  const worker = new Worker(url, { type: 'classic', name: 'czap-renderer' });

  URL.revokeObjectURL(url);

  const frameListeners = new Set<(output: VideoFrameOutput) => void>();
  const completeListeners = new Set<(totalFrames: number) => void>();

  worker.addEventListener('message', (e: MessageEvent<FromWorkerMessage>) => {
    const msg = e.data;
    if (!msg || typeof msg.type !== 'string') return;

    switch (msg.type) {
      case 'frame':
        for (const cb of frameListeners) cb(msg.output);
        break;
      case 'render-complete':
        for (const cb of completeListeners) cb(msg.totalFrames);
        break;
      case 'error':
        Diagnostics.error({
          source: 'czap/worker.render-worker',
          code: 'worker-message-error',
          message: 'Render worker reported an error.',
          detail: msg.message,
        });
        break;
    }
  });

  worker.addEventListener('error', (e: ErrorEvent) => {
    Diagnostics.error({
      source: 'czap/worker.render-worker',
      code: 'worker-unhandled-error',
      message: 'Render worker raised an unhandled error.',
      detail: e.message,
    });
  });

  // Initialize
  _send(worker, { type: 'init' });

  return {
    get worker(): Worker {
      return worker;
    },

    transferCanvas(canvas) {
      // The canvas is Transferable -- it must be in the transfer list
      _send(worker, { type: 'transfer-canvas', canvas }, [canvas]);
    },

    startRender(config) {
      _send(worker, { type: 'start-render', config });
    },

    stopRender() {
      _send(worker, { type: 'stop-render' });
    },

    onFrame(callback) {
      frameListeners.add(callback);
      return () => {
        frameListeners.delete(callback);
      };
    },

    onComplete(callback) {
      completeListeners.add(callback);
      return () => {
        completeListeners.delete(callback);
      };
    },

    dispose() {
      _send(worker, { type: 'dispose' });
      frameListeners.clear();
      completeListeners.clear();
      worker.terminate();
    },
  };
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/**
 * Factory namespace for the render worker.
 *
 * Call {@link RenderWorker.create} on the main thread to mint a worker
 * that owns an `OffscreenCanvas` and renders `VideoFrameOutput` frames
 * off the main thread. Transfer control via
 * {@link RenderWorkerShape.transferCanvas} before calling `startRender`.
 *
 * @example
 * ```ts
 * import { RenderWorker } from '@czap/worker';
 *
 * const renderer = RenderWorker.create();
 * const offscreen = canvas.transferControlToOffscreen();
 * renderer.transferCanvas(offscreen);
 * renderer.onFrame((frame) => {
 *   // stream frame.image / frame.timestampMs somewhere
 * });
 * renderer.startRender({ durationMs: 4000, fps: 30, width: 640, height: 360 });
 * ```
 */
export const RenderWorker = {
  /**
   * Spin up a render worker. The worker starts idle; transfer an
   * `OffscreenCanvas` via
   * {@link RenderWorkerShape.transferCanvas} before calling
   * `startRender`.
   */
  create: _createRenderWorker,
} as const;

export declare namespace RenderWorker {
  /** Public host-side surface returned by {@link RenderWorker.create}. */
  export type Shape = RenderWorkerShape;
}
