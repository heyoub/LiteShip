/**
 * Client-runtime helpers for parsing serialized boundaries out of
 * `data-czap-boundary` attributes, attaching viewport observers,
 * evaluating boundaries live, and applying the resulting state to a
 * satellite element.
 *
 * Consumed by the Astro `client:satellite` / `client:worker` directives
 * when they hydrate a server-rendered `<div data-czap-boundary="...">`.
 *
 * @module
 */
import { Boundary } from '@czap/core';

/**
 * JSON shape produced on the server by `satelliteAttrs()` and read back
 * on the client via {@link parseBoundary}. Every field corresponds
 * directly to a {@link Boundary.Shape} input.
 */
export interface SerializedBoundary {
  /** Optional stable boundary id (becomes the runtime `name`). */
  readonly id?: string;
  /** Signal key this boundary consumes (e.g. `"viewport.width"`). */
  readonly input: string;
  /** Ordered ascending thresholds (`thresholds[i]` lower bound of `states[i]`). */
  readonly thresholds: readonly number[];
  /** Non-empty ordered state labels. */
  readonly states: readonly [string, ...string[]];
  /** Optional hysteresis band applied during evaluation. */
  readonly hysteresis?: number;
}

/**
 * Client-side representation of a parsed boundary plus its resolved
 * runtime name, ready to be evaluated against a live signal.
 */
export interface RuntimeBoundary {
  /** Resolved boundary name (defaults to `"default"`). */
  readonly name: string;
  /** Signal key this boundary consumes. */
  readonly input: string;
  /** Fully-constructed `Boundary.Shape` ready for evaluation. */
  readonly boundary: Boundary.Shape<string, readonly [string, ...string[]]>;
}

/**
 * Normalised boundary-state payload used for `CustomEvent` dispatch and
 * DOM application. CSS keys are filtered to `--czap-*`; ARIA keys to
 * `role` / `aria-*`.
 */
export interface BoundaryStateDetail {
  /** Discrete state per quantizer name. */
  readonly discrete: Record<string, string>;
  /** Whitelisted `--czap-*` CSS variable map. */
  readonly css: Record<string, string | number>;
  /** GLSL uniform map (`u_*`). */
  readonly glsl: Record<string, number>;
  /** Whitelisted ARIA attribute map. */
  readonly aria: Record<string, string>;
}

function isAllowedBoundaryCssProperty(property: string): boolean {
  return property.startsWith('--czap-');
}

// NOTE: This logic is intentionally duplicated from `isValidAriaKey` in
// packages/compiler/src/aria.ts. @czap/astro does not depend on @czap/compiler,
// so the check cannot be shared without introducing a new dependency. Keep the
// two implementations in sync if either changes.
function isAllowedBoundaryAttribute(attribute: string): boolean {
  return attribute === 'role' || attribute.startsWith('aria-');
}

function parseBoundaryPayload(boundaryJson: string): Partial<SerializedBoundary> | null {
  let parsed: Partial<SerializedBoundary> | null = null;
  let malformed = false;

  try {
    parsed = JSON.parse(boundaryJson) as Partial<SerializedBoundary>;
  } catch (error) {
    if (error instanceof SyntaxError) {
      malformed = true;
    } else {
      throw error;
    }
  }

  return malformed ? null : parsed;
}

/**
 * Parse a JSON-serialised boundary (as produced by
 * `satelliteAttrs()`) into a {@link RuntimeBoundary}. Returns `null`
 * for malformed or structurally invalid payloads so callers can fall
 * back cleanly rather than throwing mid-hydration.
 */
export function parseBoundary(boundaryJson: string | null): RuntimeBoundary | null {
  if (!boundaryJson) {
    return null;
  }

  const parsed = parseBoundaryPayload(boundaryJson);
  if (!parsed) {
    return null;
  }

  if (
    typeof parsed.input !== 'string' ||
    !Array.isArray(parsed.thresholds) ||
    parsed.thresholds.length === 0 ||
    !Array.isArray(parsed.states) ||
    parsed.states.length === 0 ||
    !parsed.thresholds.every((value) => typeof value === 'number') ||
    !parsed.states.every((value) => typeof value === 'string')
  ) {
    return null;
  }

  const states = parsed.states as readonly [string, ...string[]];
  const first = [parsed.thresholds[0]!, states[0]] as const;
  const rest = parsed.thresholds.slice(1).map((threshold, index) => [threshold, states[index + 1]!] as const);
  const at = [first, ...rest] as const;

  return {
    name: parsed.id ?? 'default',
    input: parsed.input,
    boundary: Boundary.make({
      input: parsed.input,
      at,
      ...(typeof parsed.hysteresis === 'number' ? { hysteresis: parsed.hysteresis } : {}),
    }),
  };
}

/**
 * Attach a ResizeObserver on `document.documentElement` that calls `callback`
 * whenever the viewport resizes, but only when `input` is a viewport signal
 * (i.e. starts with `"viewport."`) and `ResizeObserver` is available.
 *
 * Returns a cleanup function that disconnects the observer, or `null` when no
 * observer was attached (non-viewport input or no ResizeObserver support).
 *
 * Centralises the identical `observeIfNeeded` blocks that previously lived in
 * satellite.ts and worker.ts.
 */
export function attachViewportObserver(input: string, callback: () => void): (() => void) | null {
  if (!input.startsWith('viewport.') || typeof ResizeObserver === 'undefined') {
    return null;
  }

  const observer = new ResizeObserver(callback);
  observer.observe(document.documentElement);
  return () => observer.disconnect();
}

/**
 * Read the current numeric value for a signal `input` (e.g.
 * `"viewport.width"`). Returns `undefined` for unknown inputs; returns
 * `0` in non-DOM environments so callers can treat SSR and malformed
 * signals uniformly.
 */
export function readSignalValue(input: string): number | undefined {
  if (typeof window === 'undefined') return 0;

  if (!input.startsWith('viewport.')) {
    return undefined;
  }

  const axis = input.slice('viewport.'.length);
  return axis === 'height' ? window.innerHeight : window.innerWidth;
}

/**
 * Evaluate a {@link RuntimeBoundary} against a signal value, applying
 * hysteresis when `previousState` is provided and the boundary has a
 * hysteresis band.
 */
export function evaluateBoundary(boundary: RuntimeBoundary, value: number, previousState?: string): string {
  if (previousState && boundary.boundary.hysteresis) {
    return Boundary.evaluateWithHysteresis(boundary.boundary, value, previousState);
  }

  return Boundary.evaluate(boundary.boundary, value);
}

/**
 * Merge `state.*` and `state.outputs.*` fields into a single
 * {@link BoundaryStateDetail}, filtering CSS keys to `--czap-*` and
 * ARIA keys to `role` / `aria-*`. Used as the `detail` of the
 * `czap:state` custom event.
 */
export function normalizeBoundaryState(state: {
  readonly discrete?: Record<string, string>;
  readonly css?: Record<string, string | number>;
  readonly glsl?: Record<string, number>;
  readonly aria?: Record<string, string>;
  readonly outputs?: {
    readonly css?: Record<string, string | number>;
    readonly glsl?: Record<string, number>;
    readonly aria?: Record<string, string>;
  };
}): BoundaryStateDetail {
  const css = { ...(state.outputs?.css ?? {}), ...(state.css ?? {}) };
  const aria = { ...(state.outputs?.aria ?? {}), ...(state.aria ?? {}) };

  return {
    discrete: { ...(state.discrete ?? {}) },
    css: Object.fromEntries(Object.entries(css).filter(([property]) => isAllowedBoundaryCssProperty(property))),
    glsl: { ...(state.outputs?.glsl ?? {}), ...(state.glsl ?? {}) },
    aria: Object.fromEntries(Object.entries(aria).filter(([attribute]) => isAllowedBoundaryAttribute(attribute))),
  };
}

/**
 * Apply a normalised state to a satellite element: sets
 * `data-czap-state`, writes whitelisted CSS variables and ARIA
 * attributes, and dispatches `eventName` + `czap:uniform-update`
 * custom events for downstream listeners (GPU/WASM runtimes).
 */
export function applyBoundaryState(
  element: HTMLElement,
  boundary: RuntimeBoundary,
  state: {
    readonly discrete?: Record<string, string>;
    readonly css?: Record<string, string | number>;
    readonly glsl?: Record<string, number>;
    readonly aria?: Record<string, string>;
    readonly outputs?: {
      readonly css?: Record<string, string | number>;
      readonly glsl?: Record<string, number>;
      readonly aria?: Record<string, string>;
    };
  },
  eventName: string,
): void {
  const detail = normalizeBoundaryState(state);
  const stateName = detail.discrete[boundary.name];

  if (stateName && element.getAttribute('data-czap-state') !== stateName) {
    element.setAttribute('data-czap-state', stateName);
  }

  for (const [property, value] of Object.entries(detail.css)) {
    element.style.setProperty(property, String(value));
  }

  for (const [attribute, value] of Object.entries(detail.aria)) {
    element.setAttribute(attribute, value);
  }

  element.dispatchEvent(
    new CustomEvent(eventName, {
      detail,
      bubbles: true,
    }),
  );

  element.dispatchEvent(
    new CustomEvent('czap:uniform-update', {
      detail,
      bubbles: true,
    }),
  );
}
