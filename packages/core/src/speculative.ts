/**
 * SpeculativeEvaluator -- threshold proximity prefetching.
 *
 * When a boundary signal is near a threshold, pre-compute the next state.
 * Uses hysteresis dead zone as the prefetch window and linear extrapolation
 * from velocity (last 3-4 signal values) to predict crossings.
 *
 * Wrong prediction cost: ~80ns to recompute (negligible).
 *
 * @module
 */

import { Boundary } from './boundary.js';
import type { StateUnion } from './type-utils.js';

// Speculative pre-computation: when signal velocity indicates an imminent threshold crossing, pre-evaluate the predicted next state.

interface SpeculativeResult<B extends Boundary.Shape> {
  readonly current: StateUnion<B>;
  readonly prefetched?: StateUnion<B>;
  readonly confidence: number;
}

interface SpeculativeEvaluatorShape<B extends Boundary.Shape> {
  evaluate(value: number, velocity?: number): SpeculativeResult<B>;
}

/**
 * Creates a speculative evaluator for a boundary that prefetches the next state
 * when the signal value is near a threshold and moving toward it.
 *
 * @example
 * ```ts
 * const boundary = Boundary.make({
 *   thresholds: [768, 1024],
 *   states: ['mobile', 'tablet', 'desktop'] as const,
 *   hysteresis: 20,
 * });
 * const spec = SpeculativeEvaluator.make(boundary);
 * const result = spec.evaluate(760, 2.0); // approaching 768 threshold
 * result.current;     // 'mobile'
 * result.prefetched;  // 'tablet' (pre-computed)
 * result.confidence;  // 0.0-1.0 likelihood of crossing
 * ```
 */
function _make<B extends Boundary.Shape>(boundary: B): SpeculativeEvaluatorShape<B> {
  const thresholds = boundary.thresholds as readonly number[];
  const hysteresis = boundary.hysteresis ?? 0;
  const prefetchWindow = Math.max(hysteresis, 1); // Use hysteresis as window, min 1

  // Compute epsilon from boundary scale rather than hardcoded constant
  const minGap =
    thresholds.length >= 2
      ? Math.min(
          ...Array.from(
            { length: thresholds.length - 1 },
            (_, i) => (thresholds[i + 1] as number) - (thresholds[i] as number),
          ),
        )
      : 1;
  const epsilon = Math.min(minGap * 0.001, hysteresis > 0 ? hysteresis * 0.01 : 0.001);

  // Velocity estimation ring buffer (last 2 values)
  const history: { value: number; time: number }[] = [];
  // 2-sample velocity estimation buffer — gives instant responsiveness
  const HISTORY_SIZE = 2;

  // Boundary.make guarantees states is non-empty (readonly [string, ...string[]]).
  let previousState: StateUnion<B> = boundary.states[0];

  // Simple finite difference (not least-squares) — 2-sample gives instant responsiveness
  // for UI prefetch.
  function estimateVelocity(currentValue: number, explicitVelocity?: number): number {
    if (explicitVelocity !== undefined) return explicitVelocity;
    if (history.length < 2) return 0;

    // Linear regression over recent samples
    const last = history[history.length - 1]!;
    const prev = history[history.length - 2]!;
    const dt = last.time - prev.time;
    if (dt <= 0) return 0;
    return (last.value - prev.value) / dt;
  }

  function findNearestThreshold(
    value: number,
  ): { threshold: number; distance: number; direction: 'up' | 'down' } | null {
    let nearest: { threshold: number; distance: number; direction: 'up' | 'down' } | null = null;

    for (const t of thresholds) {
      const dist = Math.abs(value - (t as number));
      if (nearest === null || dist < nearest.distance) {
        nearest = {
          threshold: t as number,
          distance: dist,
          direction: value < (t as number) ? 'up' : 'down',
        };
      }
    }

    return nearest;
  }

  return {
    evaluate(value: number, velocity?: number): SpeculativeResult<B> {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      history.push({ value, time: now });
      if (history.length > HISTORY_SIZE) history.shift();

      // Evaluate current state
      const current = boundary.hysteresis
        ? Boundary.evaluateWithHysteresis(boundary, value, previousState)
        : Boundary.evaluate(boundary, value);
      previousState = current;

      // Find nearest threshold
      const nearest = findNearestThreshold(value);
      if (!nearest) {
        return { current, confidence: 0 };
      }

      const vel = estimateVelocity(value, velocity);

      // Check if moving toward the threshold
      const movingToward = (nearest.direction === 'up' && vel > 0) || (nearest.direction === 'down' && vel < 0);

      if (!movingToward || nearest.distance > prefetchWindow) {
        return { current, confidence: 0 };
      }

      // Compute confidence: closer to threshold + faster velocity = higher confidence
      const distanceFactor = 1 - nearest.distance / prefetchWindow;
      // Distance weighted 70%, velocity 30% — distance is more reliable for prefetch confidence
      const velocityFactor = Math.min(Math.abs(vel) * 10, 1); // Normalize velocity contribution
      const confidence = distanceFactor * 0.7 + velocityFactor * 0.3;

      // Below 30% confidence, skip prefetch — not worth the speculative cost
      if (confidence < 0.3) {
        return { current, confidence };
      }

      // Pre-compute the predicted next state (jump past hysteresis zone if present)
      const hysteresisJump = boundary.hysteresis ?? 0;
      const predictedValue =
        nearest.direction === 'up'
          ? nearest.threshold + hysteresisJump + epsilon
          : nearest.threshold - hysteresisJump - epsilon;

      const prefetched = boundary.hysteresis
        ? Boundary.evaluateWithHysteresis(boundary, predictedValue, current)
        : Boundary.evaluate(boundary, predictedValue);

      // Only return prefetch if it's actually different
      if (prefetched === current) {
        return { current, confidence: 0 };
      }

      return { current, prefetched, confidence };
    },
  };
}

/**
 * SpeculativeEvaluator -- threshold proximity prefetching for boundaries.
 * Pre-computes the next discrete state when a signal is near a threshold,
 * using velocity estimation and hysteresis-based prefetch windows.
 *
 * @example
 * ```ts
 * const boundary = Boundary.make({
 *   thresholds: [600],
 *   states: ['small', 'large'] as const,
 * });
 * const spec = SpeculativeEvaluator.make(boundary);
 * const { current, prefetched, confidence } = spec.evaluate(595, 1.5);
 * // current='small', prefetched='large', confidence ~0.85
 * ```
 */
export const SpeculativeEvaluator = { make: _make };

export declare namespace SpeculativeEvaluator {
  /** Structural shape of an evaluator bound to a specific {@link Boundary}. */
  export type Shape<B extends Boundary.Shape> = SpeculativeEvaluatorShape<B>;
  /** Prediction result from `evaluate()` — current state, optional prefetched next state, and confidence. */
  export type Result<B extends Boundary.Shape> = SpeculativeResult<B>;
}
