/**
 * VideoSystem — clamps opacity=1 when the frame index lies within
 * each video entity's FrameRange, opacity=0 otherwise. Runs once per
 * tick; in production wraps a dense Opacity store for zero-alloc
 * iteration.
 *
 * @module
 */

import { Effect } from 'effect';
import type { System, World } from '@czap/core';

/** Build a VideoSystem keyed to a specific frame index. */
export function VideoSystem(frameIndex: number): System {
  return {
    name: 'VideoSystem',
    query: ['VideoSource', 'FrameRange'],
    execute: (entities, world?: World.Shape) =>
      Effect.gen(function* () {
        for (const e of entities) {
          const range = e.components.get('FrameRange') as { from: number; to: number };
          const opacity = frameIndex >= range.from && frameIndex < range.to ? 1 : 0;
          (e as unknown as { _opacity: number })._opacity = opacity;
          if (world !== undefined) {
            yield* world.setComponent(e.id, '_opacity', opacity);
          }
        }
      }),
  };
}
