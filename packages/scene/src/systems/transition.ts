/**
 * TransitionSystem — computes a normalized blend factor [0,1] across
 * each transition entity's FrameRange. Downstream the compositor
 * combines the two `Between` entities using this factor.
 *
 * @module
 */

import { Effect } from 'effect';
import type { System, World } from '@czap/core';

/** Build a TransitionSystem keyed to a frame index. */
export function TransitionSystem(frameIndex: number): System {
  return {
    name: 'TransitionSystem',
    query: ['TransitionKind', 'FrameRange', 'Between'],
    execute: (entities, world?: World.Shape) =>
      Effect.gen(function* () {
        for (const e of entities) {
          const range = e.components.get('FrameRange') as { from: number; to: number };
          const span = Math.max(1, range.to - range.from);
          const local = Math.max(0, Math.min(1, (frameIndex - range.from) / span));
          (e as unknown as { _blend: number })._blend = local;
          if (world !== undefined) {
            yield* world.setComponent(e.id, '_blend', local);
          }
        }
      }),
  };
}
