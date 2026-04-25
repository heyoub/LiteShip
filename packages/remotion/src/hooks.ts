/**
 * Remotion hooks -- React bindings for CompositeState in Remotion compositions.
 *
 * @module
 */

import type { CompositeState, VideoFrameOutput } from '@czap/core';
import { useCurrentFrame } from 'remotion';

// ---------------------------------------------------------------------------
// CSS var extraction
// ---------------------------------------------------------------------------

/**
 * Convert `CompositeState.outputs.css` into a flat CSS custom property map.
 *
 * The returned record is suitable for use directly as a React `style` prop
 * or a Remotion `style` prop -- every key is a CSS variable name (e.g.
 * `--czap-color-fg`) and every value is coerced to a string.
 *
 * @param state - A composite state produced by a `VideoRenderer` frame.
 * @returns A flat `{ [cssVar]: string }` map.
 *
 * @example
 * ```tsx
 * const vars = cssVarsFromState(state);
 * return <div style={vars}>...</div>;
 * ```
 */
export function cssVarsFromState(state: CompositeState): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(state.outputs.css)) {
    result[key] = String(value);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Frame-indexed state lookup
// ---------------------------------------------------------------------------

/**
 * Look up the `CompositeState` for a given frame index from precomputed
 * frames.
 *
 * Clamps to valid range: negative indices return the first frame; indices
 * past the end return the last frame. An empty `frames` array yields a
 * structurally-empty `CompositeState` so callers never have to guard for
 * undefined output.
 *
 * @param frames - Output of {@link precomputeFrames}.
 * @param frameIndex - Zero-based frame index (typically from Remotion's
 *   `useCurrentFrame`).
 * @returns The state at the clamped frame.
 *
 * @example
 * ```ts
 * const state = stateAtFrame(frames, 42);
 * ```
 */
export function stateAtFrame(frames: ReadonlyArray<VideoFrameOutput>, frameIndex: number): CompositeState {
  if (frames.length === 0) {
    return { discrete: {}, blend: {}, outputs: { css: {}, glsl: {}, aria: {} } };
  }
  const clamped = Math.max(0, Math.min(frameIndex, frames.length - 1));
  return frames[clamped]!.state;
}

// ---------------------------------------------------------------------------
// React hook (requires remotion peer dependency)
// ---------------------------------------------------------------------------

/**
 * Remotion-aware hook that returns the `CompositeState` for the current
 * frame. Internally calls Remotion's `useCurrentFrame` and defers to
 * {@link stateAtFrame} for lookup.
 *
 * @param frames - Precomputed frames (see {@link precomputeFrames}).
 * @returns State for the current Remotion frame.
 *
 * @example
 * ```tsx
 * import { cssVarsFromState, useCompositeState } from '@czap/remotion';
 *
 * function MyComposition({ frames }: { frames: VideoFrameOutput[] }) {
 *   const state = useCompositeState(frames);
 *   const vars = cssVarsFromState(state);
 *   return <div style={vars}>...</div>;
 * }
 * ```
 */
export function useCompositeState(frames: ReadonlyArray<VideoFrameOutput>): CompositeState {
  const frame = useCurrentFrame();
  return stateAtFrame(frames, frame);
}
