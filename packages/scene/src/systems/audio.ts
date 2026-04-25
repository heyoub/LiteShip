/**
 * AudioSystem — maps video frame index to audio sample phase for each
 * audio entity in range. Feeds the receipt layer that downstream mixers
 * (user-provided) consume.
 *
 * @module
 */

import { Effect } from 'effect';
import type { System, World } from '@czap/core';

/** Build an AudioSystem keyed to frame index + fps + sample rate. */
export function AudioSystem(frameIndex: number, fps: number, sampleRate: number): System {
  const samplesPerFrame = sampleRate / fps;
  return {
    name: 'AudioSystem',
    query: ['AudioSource', 'FrameRange'],
    execute: (entities, world?: World.Shape) =>
      Effect.gen(function* () {
        for (const e of entities) {
          const range = e.components.get('FrameRange') as { from: number; to: number };
          const inRange = frameIndex >= range.from && frameIndex < range.to;
          const phase = inRange ? (frameIndex - range.from) * samplesPerFrame : 0;
          (e as unknown as { _phase: number })._phase = phase;
          if (world !== undefined) {
            yield* world.setComponent(e.id, '_phase', phase);
          }
        }
      }),
  };
}
