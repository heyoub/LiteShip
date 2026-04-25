import { describe, it, expect } from 'vitest';
import { Effect } from 'effect';
import { World } from '@czap/core';
import { EffectSystem } from '@czap/scene';

describe('EffectSystem', () => {
  it('produces intensity for effect entities in range', async () => {
    const program = Effect.gen(function* () {
      const world = yield* World.make();
      yield* world.spawn({
        EffectKind: 'pulse', TargetEntity: 'hero', FrameRange: { from: 0, to: 60 },
      });
      yield* world.addSystem(EffectSystem(30));
      yield* world.tick();
      const fx = yield* world.query('EffectKind');
      const ent = fx[0] as unknown as { _intensity: number };
      expect(ent._intensity).toBeGreaterThan(0);
      expect(ent._intensity).toBeLessThanOrEqual(1);
    });
    await Effect.runPromise(Effect.scoped(program));
  });

  it('emits zero intensity for out-of-range effects', async () => {
    const program = Effect.gen(function* () {
      const world = yield* World.make();
      yield* world.spawn({ EffectKind: 'pulse', TargetEntity: 'hero', FrameRange: { from: 60, to: 120 } });
      yield* world.addSystem(EffectSystem(0));
      yield* world.tick();
      const fx = yield* world.query('EffectKind');
      const ent = fx[0] as unknown as { _intensity: number };
      expect(ent._intensity).toBe(0);
    });
    await Effect.runPromise(Effect.scoped(program));
  });
});
