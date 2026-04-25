/**
 * Shared inline source for `evaluateThresholds` injected into worker blob scripts.
 *
 * Worker blob scripts cannot use ES module imports at runtime, so the
 * threshold-evaluation logic must be inlined as a string. This module is the
 * single source of truth for that string so both compositor-worker.ts and
 * render-worker.ts stay in sync automatically.
 *
 * Canonical TypeScript implementation: `packages/quantizer/src/evaluate.ts`
 * (`evaluate` / `Evaluate.evaluate` in `@czap/quantizer`).
 *
 * @module
 */

/**
 * Inline JavaScript source for the `evaluateThresholds` helper.
 *
 * This is a simplified (no-hysteresis) version of the canonical
 * `Evaluate.evaluate` from `@czap/quantizer`, suitable for embedding in
 * self-contained worker blob scripts.
 */
export const EVALUATE_THRESHOLDS_SOURCE = `\
/**
 * Evaluate which discrete state a value falls into based on thresholds.
 * Thresholds are sorted ascending; the value maps to the state whose
 * threshold it first exceeds (or the first state if below all thresholds).
 *
 * Canonical TypeScript implementation: packages/quantizer/src/evaluate.ts
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
}`;
