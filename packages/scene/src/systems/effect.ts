/**
 * EffectSystem — computes normalized intensity [0,1] for each effect
 * entity whose FrameRange covers the current frame. Real effect
 * application lives in compositor-side shaders; this system just
 * decides "what fraction of the effect is active right now".
 *
 * @module
 */

import { Effect } from 'effect';
import type { System, World } from '@czap/core';

/** Build an EffectSystem keyed to a frame index. */
export function EffectSystem(frameIndex: number): System {
  return {
    name: 'EffectSystem',
    query: ['EffectKind', 'FrameRange'],
    execute: (entities, world?: World.Shape) =>
      Effect.gen(function* () {
        for (const e of entities) {
          const range = e.components.get('FrameRange') as { from: number; to: number };
          const inRange = frameIndex >= range.from && frameIndex < range.to;
          if (!inRange) {
            (e as unknown as { _intensity: number })._intensity = 0;
            if (world !== undefined) {
              yield* world.setComponent(e.id, '_intensity', 0);
            }
            continue;
          }
          const span = Math.max(1, range.to - range.from);
          const local = Math.min(1, Math.max(0, (frameIndex - range.from) / span));
          (e as unknown as { _intensity: number })._intensity = local;
          if (world !== undefined) {
            yield* world.setComponent(e.id, '_intensity', local);
          }
        }
      }),
  };
}
