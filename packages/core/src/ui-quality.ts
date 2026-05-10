/**
 * UIQuality -- maps buffer occupancy + device capability to UI complexity tier.
 *
 * Same pattern as video ABR (Adaptive Bitrate). Composite signal from
 * buffer occupancy and device tier determines rendering fidelity.
 *
 * @module
 */

import type { MotionTier as _MotionTier } from '@czap/_spine';
import { Boundary } from './boundary.js';

/**
 * Motion tier — re-anchored from `@czap/_spine` (the canonical declaration
 * per ADR-0010). The ladder runs from lowest capability (`none`, forced by
 * `prefers-reduced-motion: reduce` regardless of GPU tier) to highest
 * (`compute`, which unlocks the Rust/WASM kernels).
 */
export type MotionTier = _MotionTier;

/**
 * Coarse UI-complexity ladder, in increasing fidelity: `skeleton` (placeholder
 * blocks only) up through `rich` (full interactive styled content).
 */
export type UIQualityTier = 'skeleton' | 'text-only' | 'styled' | 'interactive' | 'rich';

/** {@link Boundary.Shape} instantiation used by {@link UIQuality} — input = `buffer-occupancy`, states = the {@link UIQualityTier} ladder. */
export type UIQualityBoundary = Boundary.Shape<
  'buffer-occupancy',
  readonly ['skeleton', 'text-only', 'styled', 'interactive', 'rich']
>;

/**
 * Pre-built boundary for UI quality based on buffer occupancy signal.
 * Thresholds tuned for streaming UI: aggressive degradation when buffer low.
 */
const uiQualityBoundary: UIQualityBoundary = Boundary.make({
  input: 'buffer-occupancy',
  at: [
    [0.0, 'skeleton'],
    [0.15, 'text-only'],
    [0.35, 'styled'],
    [0.6, 'interactive'],
    [0.85, 'rich'],
  ] as const,
  hysteresis: 0.1,
});

/**
 * Motion tier to normalized device capability score (0-1).
 */
const DEVICE_CAPABILITY_SCORES: Record<MotionTier, number> = {
  none: 0.0,
  transitions: 0.25,
  animations: 0.5,
  physics: 0.75,
  compute: 1.0,
};

interface UIQualityEvaluatorShape {
  evaluate(bufferOccupancy: number, deviceTier?: MotionTier): UIQualityTier;
  readonly boundary: UIQualityBoundary;
}

function _make(): UIQualityEvaluatorShape {
  let previousTier: UIQualityTier = 'skeleton';

  return {
    evaluate(bufferOccupancy: number, deviceTier?: MotionTier): UIQualityTier {
      // Composite signal: buffer occupancy weighted more heavily
      const deviceScore = deviceTier ? DEVICE_CAPABILITY_SCORES[deviceTier] : 0.5;
      const composite = bufferOccupancy * 0.7 + deviceScore * 0.3;

      // Boundary.evaluateWithHysteresis now returns the exact state literal union ('skeleton' | ... | 'rich')
      // because uiQualityBoundary's S parameter is narrowed via `as const`.
      const result = Boundary.evaluateWithHysteresis(uiQualityBoundary, composite, previousTier);

      previousTier = result;
      return result;
    },

    boundary: uiQualityBoundary,
  };
}

/**
 * UIQuality — adaptive-bitrate-style UI fidelity gate.
 *
 * Combines buffer occupancy (how far ahead the generator is) and device
 * {@link MotionTier} into a composite score and maps it via {@link Boundary}
 * with hysteresis to a {@link UIQualityTier}.
 */
export const UIQuality = {
  /** Build a stateful evaluator that remembers the previous tier for hysteresis. */
  make: _make,
  /** The pre-built boundary — exposed so callers can compile it to CSS/GLSL directly. */
  boundary: uiQualityBoundary,
};

export declare namespace UIQuality {
  /** Structural shape of a UIQuality evaluator. */
  export type Shape = UIQualityEvaluatorShape;
  /** Alias for {@link UIQualityTier}. */
  export type Tier = UIQualityTier;
}
