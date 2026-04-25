import { describe, it, expect } from 'vitest';
import { Effect } from 'effect';
import { World } from '@czap/core';
import { VideoSystem } from '@czap/scene';

describe('VideoSystem', () => {
  it('updates opacity for entities within FrameRange', async () => {
    const program = Effect.gen(function* () {
      const world = yield* World.make();
      yield* world.spawn({
        VideoSource: {}, FrameRange: { from: 0, to: 60 }, TrackLayer: 0,
      });
      yield* world.addSystem(VideoSystem(30));
      yield* world.tick();
      const entities = yield* world.query('VideoSource');
      const ent = entities[0] as unknown as { _opacity: number };
      expect(ent._opacity).toBe(1);
    });
    await Effect.runPromise(Effect.scoped(program));
  });

  it('clamps opacity to 0 for out-of-range frames', async () => {
    const program = Effect.gen(function* () {
      const world = yield* World.make();
      yield* world.spawn({ VideoSource: {}, FrameRange: { from: 0, to: 60 }, TrackLayer: 0 });
      yield* world.addSystem(VideoSystem(120));
      yield* world.tick();
      const entities = yield* world.query('VideoSource');
      const ent = entities[0] as unknown as { _opacity: number };
      expect(ent._opacity).toBe(0);
    });
    await Effect.runPromise(Effect.scoped(program));
  });
});
