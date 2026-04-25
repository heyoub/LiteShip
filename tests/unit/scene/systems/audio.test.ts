import { describe, it, expect } from 'vitest';
import { Effect } from 'effect';
import { World } from '@czap/core';
import { AudioSystem } from '@czap/scene';

describe('AudioSystem', () => {
  it('produces frame-sample mapping for audio entities in range', async () => {
    const program = Effect.gen(function* () {
      const world = yield* World.make();
      yield* world.spawn({
        AudioSource: 'bed', FrameRange: { from: 0, to: 120 }, Volume: -6, Pan: 0,
      });
      yield* world.addSystem(AudioSystem(30, 60, 48000));
      yield* world.tick();
      const entities = yield* world.query('AudioSource');
      const ent = entities[0] as unknown as { _phase: number };
      expect(ent._phase).toBeCloseTo(30 * (48000 / 60), 0);
    });
    await Effect.runPromise(Effect.scoped(program));
  });

  it('emits zero phase for out-of-range entities', async () => {
    const program = Effect.gen(function* () {
      const world = yield* World.make();
      yield* world.spawn({ AudioSource: 'bed', FrameRange: { from: 60, to: 120 }, Volume: 0, Pan: 0 });
      yield* world.addSystem(AudioSystem(0, 60, 48000));
      yield* world.tick();
      const entities = yield* world.query('AudioSource');
      const ent = entities[0] as unknown as { _phase: number };
      expect(ent._phase).toBe(0);
    });
    await Effect.runPromise(Effect.scoped(program));
  });
});
