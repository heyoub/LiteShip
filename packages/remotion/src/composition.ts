/**
 * Remotion composition helpers -- precompute frames, context provider.
 *
 * @module
 */

import type { VideoRenderer, VideoFrameOutput, CompositeState } from '@czap/core';
import { createContext, useContext, createElement } from 'react';
import { useCurrentFrame } from 'remotion';

// ---------------------------------------------------------------------------
// Frame precomputation
// ---------------------------------------------------------------------------

/**
 * Precompute every {@link VideoFrameOutput} from a `VideoRenderer` into
 * an in-memory array.
 *
 * Call this once on the server (or in a Remotion `calculateMetadata`) before
 * rendering so compositions can index the result by frame number without
 * re-invoking the renderer. The returned array's length is the renderer's
 * total frame count.
 *
 * @param renderer - A `VideoRenderer.Shape` produced by `@czap/core`.
 * @returns Frames in timeline order.
 *
 * @example
 * ```ts
 * const frames = await precomputeFrames(renderer);
 * ```
 */
export async function precomputeFrames(renderer: VideoRenderer.Shape): Promise<ReadonlyArray<VideoFrameOutput>> {
  const frames: VideoFrameOutput[] = [];
  for await (const frame of renderer.frames()) {
    frames.push(frame);
  }
  return frames;
}

// ---------------------------------------------------------------------------
// React context
// ---------------------------------------------------------------------------

const emptyState: CompositeState = {
  discrete: {},
  blend: {},
  outputs: { css: {}, glsl: {}, aria: {} },
};

const CzapContext = createContext<ReadonlyArray<VideoFrameOutput>>([]);

/**
 * React context provider that makes precomputed frames available to
 * {@link useCzapState} anywhere in the subtree. Use this when you prefer
 * implicit frame lookup over threading the `frames` array through props.
 *
 * @example
 * ```tsx
 * <Provider frames={frames}>
 *   <MyComposition />
 * </Provider>
 * ```
 */
export function Provider(props: { frames: ReadonlyArray<VideoFrameOutput>; children: unknown }): unknown {
  return createElement(CzapContext.Provider, { value: props.frames }, props.children);
}

/**
 * Hook that reads the `CompositeState` for the current Remotion frame
 * from the nearest {@link Provider}. Returns a structurally-empty state
 * when no provider is mounted (or it holds no frames) so callers never
 * crash at the boundary.
 */
export function useCzapState(): CompositeState {
  const frames = useContext(CzapContext);
  const frame = useCurrentFrame();
  if (frames.length === 0) return emptyState;
  const clamped = Math.max(0, Math.min(frame, frames.length - 1));
  return frames[clamped]!.state;
}
