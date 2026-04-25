import { describe, it, expect } from 'vitest';
import { Effect } from 'effect';
import { World } from '@czap/core';
import { SyncSystem } from '@czap/scene';

/**
 * SyncSystem post-Task-9: reads beat markers from `Beat`-tagged
 * entities in the world (populated by the `scene.beat-binding`
 * capsule) instead of the legacy closure-private `_beats` sidecar.
 *
 * These tests construct beat entities directly via `world.spawn`
 * to exercise SyncSystem in isolation without the runtime layer.
 */
describe('SyncSystem (world-query path)', () => {
  it('pulses intensity to ~1 on the frame of a beat', async () => {
    const program = Effect.gen(function* () {
      const world = yield* World.make();
      // SyncAnchor entity that the system writes _intensity onto.
      yield* world.spawn({
        SyncAnchor: { anchor: 'bed', mode: 'beat' },
        TargetEntity: 'hero',
      });
      // Beat entities the system queries for. Frame 30 at 60fps = 500 ms.
      yield* world.spawn({ Beat: { kind: 'beat', timeMs: 0, strength: 1 } });
      yield* world.spawn({ Beat: { kind: 'beat', timeMs: 500, strength: 1 } });
      yield* world.spawn({ Beat: { kind: 'beat', timeMs: 1000, strength: 1 } });
      // frameIndex=30 at 60fps → currentTimeMs = 500 → lastBeat = 500 → exp(0) = 1.
      yield* world.addSystem(SyncSystem(30, 60));
      yield* world.tick();
      const fx = yield* world.query('SyncAnchor');
      const intensity = fx[0]?.components.get('_intensity');
      expect(typeof intensity).toBe('number');
      expect(intensity as number).toBeCloseTo(1, 2);
    });
    await Effect.runPromise(Effect.scoped(program));
  });

  it('emits lower intensity mid-beat with exponential decay', async () => {
    const program = Effect.gen(function* () {
      const world = yield* World.make();
      yield* world.spawn({
        SyncAnchor: { anchor: 'bed', mode: 'beat' },
        TargetEntity: 'hero',
      });
      // Beats at t=0 and t=1000 ms. At frameIndex=30, fps=60 we are at
      // 500 ms — half-way between beats — so intensity should be
      // exp(-500/250) = exp(-2) ≈ 0.135, well under 0.5.
      yield* world.spawn({ Beat: { kind: 'beat', timeMs: 0, strength: 1 } });
      yield* world.spawn({ Beat: { kind: 'beat', timeMs: 1000, strength: 1 } });
      yield* world.addSystem(SyncSystem(30, 60));
      yield* world.tick();
      const fx = yield* world.query('SyncAnchor');
      const intensity = fx[0]?.components.get('_intensity');
      expect(typeof intensity).toBe('number');
      expect(intensity as number).toBeLessThan(0.5);
    });
    await Effect.runPromise(Effect.scoped(program));
  });

  it('writes intensity = 0 when no beats have occurred yet (lastBeat = -Infinity → exp(-Inf) = 0)', async () => {
    const program = Effect.gen(function* () {
      const world = yield* World.make();
      yield* world.spawn({ SyncAnchor: { anchor: 'bed', mode: 'beat' } });
      // Future beat only — current frame is before it.
      yield* world.spawn({ Beat: { kind: 'beat', timeMs: 5000, strength: 1 } });
      yield* world.addSystem(SyncSystem(30, 60)); // currentTimeMs = 500
      yield* world.tick();
      const fx = yield* world.query('SyncAnchor');
      const intensity = fx[0]?.components.get('_intensity');
      expect(intensity).toBe(0);
    });
    await Effect.runPromise(Effect.scoped(program));
  });

  it('skips Beat entities whose Beat component is missing or has a non-numeric timeMs', async () => {
    // Forces the L48-49 / L51 guard branches: a Beat-tagged entity with
    // an unrelated component shape, plus another with a non-numeric
    // timeMs, must not contaminate the time-line. The system should
    // still produce the correct decay against the one valid beat.
    const program = Effect.gen(function* () {
      const world = yield* World.make();
      yield* world.spawn({ SyncAnchor: { anchor: 'bed', mode: 'beat' } });
      // Entity spawned via the queryable id 'Beat' but with no Beat field.
      yield* world.spawn({ Beat: undefined as unknown as Record<string, unknown> });
      // Entity with a Beat object whose timeMs is the wrong type.
      yield* world.spawn({ Beat: { kind: 'beat', timeMs: 'oops', strength: 1 } });
      // One real beat at t=500ms.
      yield* world.spawn({ Beat: { kind: 'beat', timeMs: 500, strength: 1 } });
      yield* world.addSystem(SyncSystem(30, 60));
      yield* world.tick();
      const fx = yield* world.query('SyncAnchor');
      const intensity = fx[0]?.components.get('_intensity');
      expect(intensity as number).toBeCloseTo(1, 2);
    });
    await Effect.runPromise(Effect.scoped(program));
  });
});
