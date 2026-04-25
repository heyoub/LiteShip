/**
 * Binary search evaluation of a value against boundary thresholds.
 * Supports hysteresis to prevent state jitter at threshold edges.
 */

import type { Boundary, StateUnion } from '@czap/core';

/**
 * Result of quantizing a single numeric value against a boundary.
 *
 * `crossed` is true only when `previousState` was supplied and differs
 * from the resolved state; it is the signal consumers use to emit
 * transition events and route side effects.
 */
export interface EvaluateResult<S extends string = string> {
  /** The resolved state literal. */
  readonly state: S;
  /** Index of `state` within the boundary's states tuple. */
  readonly index: number;
  /** The input value that was evaluated. */
  readonly value: number;
  /** Whether evaluation produced a change from `previousState`. */
  readonly crossed: boolean;
}

/**
 * Find which state a value maps to via binary search over sorted thresholds.
 * With hysteresis: if previousState is provided and the value is within the
 * hysteresis dead zone of a threshold, transition is suppressed.
 *
 * BoundaryDef contract: `thresholds[i]` = lower bound of `states[i]`.
 * Binary search finds the largest index `i` where `thresholds[i] <= value`.
 *
 * @example
 * ```ts
 * import { Boundary } from '@czap/core';
 * import { evaluate } from '@czap/quantizer';
 *
 * const boundary = Boundary.make({
 *   input: 'width', states: ['sm', 'md', 'lg'] as const,
 *   thresholds: [0, 640, 1024], hysteresis: 20,
 * });
 * const result = evaluate(boundary, 800);
 * // result => { state: 'md', index: 1, value: 800, crossed: false }
 *
 * const cross = evaluate(boundary, 1100, 'md');
 * // cross => { state: 'lg', index: 2, value: 1100, crossed: true }
 * ```
 *
 * @param boundary      - The boundary definition with states and thresholds
 * @param value         - The numeric value to evaluate
 * @param previousState - Optional previous state for hysteresis and crossing detection
 * @returns An {@link EvaluateResult} with the resolved state, index, and crossing flag
 */
export function evaluate<B extends Boundary.Shape>(
  boundary: B,
  value: number,
  previousState?: StateUnion<B>,
): EvaluateResult<StateUnion<B> & string> {
  const { thresholds, states, hysteresis } = boundary;
  // Boundary.make guarantees states is non-empty; index access below yields StateUnion<B>.
  // `& string` is structurally satisfied because every state literal is a string.
  const stateAt = (index: number): StateUnion<B> & string => states[index] as StateUnion<B> & string;

  if (thresholds.length === 0) {
    return {
      state: stateAt(0),
      index: 0,
      value,
      crossed: false,
    };
  }

  // Binary search: find largest index i where thresholds[i] <= value
  // This gives the state whose lower bound is satisfied.
  let lo = 0;
  let hi = thresholds.length - 1;
  let rawIndex = 0; // default: first state (value below all thresholds)
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if ((thresholds[mid] as number) <= value) {
      rawIndex = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  const state = stateAt(rawIndex);

  // Without hysteresis or no previous state, return raw result
  if (!hysteresis || hysteresis <= 0 || previousState === undefined) {
    const crossed = previousState !== undefined && previousState !== state;
    return { state, index: rawIndex, value, crossed };
  }

  // Find previous state index
  const prevIndex = (states as readonly string[]).indexOf(previousState as string);
  if (prevIndex === -1) {
    return { state, index: rawIndex, value, crossed: true };
  }

  // No crossing needed
  if (rawIndex === prevIndex) {
    return { state, index: rawIndex, value, crossed: false };
  }

  // Half-width hysteresis: dead zone of h/2 each side of threshold
  const half = hysteresis / 2;

  // Check ALL intermediate thresholds for dead zone suppression
  if (rawIndex > prevIndex) {
    // Crossing upward -- check thresholds from prevIndex+1 to rawIndex
    for (let i = prevIndex + 1; i <= rawIndex; i++) {
      const threshold = thresholds[i] as number | undefined;
      if (threshold !== undefined && value < threshold + half) {
        // In dead zone -- settle at state just below this threshold
        const settleIndex = i - 1;
        return { state: stateAt(settleIndex), index: settleIndex, value, crossed: settleIndex !== prevIndex };
      }
    }
  } else {
    // Crossing downward -- check thresholds from prevIndex down to rawIndex+1
    for (let i = prevIndex; i > rawIndex; i--) {
      const threshold = thresholds[i] as number | undefined;
      if (threshold !== undefined && value > threshold - half) {
        // In dead zone -- settle at this state
        return { state: stateAt(i), index: i, value, crossed: i !== prevIndex };
      }
    }
  }

  // Cleared all dead zones -- full transition
  return { state, index: rawIndex, value, crossed: true };
}

/**
 * Boundary evaluation namespace.
 *
 * Provides `evaluate()` for mapping a numeric value to a discrete state
 * via binary search over boundary thresholds with optional hysteresis
 * to prevent jitter at threshold edges.
 *
 * @example
 * ```ts
 * import { Boundary } from '@czap/core';
 * import { Evaluate } from '@czap/quantizer';
 *
 * const boundary = Boundary.make({
 *   input: 'width', states: ['sm', 'lg'] as const,
 *   thresholds: [0, 768], hysteresis: 10,
 * });
 * const r1 = Evaluate.evaluate(boundary, 500);
 * // r1.state => 'sm', r1.crossed => false
 *
 * const r2 = Evaluate.evaluate(boundary, 900, 'sm');
 * // r2.state => 'lg', r2.crossed => true
 * ```
 */
export const Evaluate = { evaluate } as const;
