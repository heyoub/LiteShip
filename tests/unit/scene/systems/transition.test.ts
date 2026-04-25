import { describe, it, expect } from 'vitest';
import { Effect } from 'effect';
import { World } from '@czap/core';
import { TransitionSystem } from '@czap/scene';

describe('TransitionSystem', () => {
  it('emits linear blend between transition.from and transition.to', async () => {
    const program = Effect.gen(function* () {
      const world = yield* World.make();
      yield* world.spawn({
        TransitionKind: 'crossfade', FrameRange: { from: 0, to: 10 }, Between: ['a', 'b'],
      });
      yield* world.addSystem(TransitionSystem(5));
      yield* world.tick();
      const ts = yield* world.query('TransitionKind');
      const ent = ts[0] as unknown as { _blend: number };
      expect(ent._blend).toBeCloseTo(0.5, 2);
    });
    await Effect.runPromise(Effect.scoped(program));
  });
});
