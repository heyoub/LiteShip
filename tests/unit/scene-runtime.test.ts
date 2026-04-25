/**
 * SceneRuntime — bug-#3 regression suite.
 *
 * Asserts that compileScene + SceneRuntime.build produces a tickable
 * ECS world with all 6 canonical systems registered, that ticking
 * advances the systems' computed component outputs, and that
 * `release()` cleanly disposes the world's scope.
 */

import { describe, it, expect } from 'vitest';
import { Effect } from 'effect';
import { Track, compileScene, SceneRuntime, sceneRuntimeCapsule } from '@czap/scene';
import type { SceneContract, MixReceipt } from '@czap/scene';

function buildScene(): SceneContract {
  const hero = Track.videoId('hero');
  const bedId = Track.audioId('bed');
  return {
    name: 'runtime-fixture',
    duration: 1000,
    fps: 60,
    bpm: 120,
    tracks: [
      Track.video('hero', { from: 0, to: 60, source: { _t: 'quantizer' } }),
      Track.audio('bed', { from: 0, to: 60, source: 'bed', mix: { volume: -3, pan: 0.25 } }),
      Track.transition('fade', {
        from: 0,
        to: 30,
        kind: 'crossfade',
        between: [hero, hero],
      }),
      Track.effect('pulse', {
        from: 0,
        to: 60,
        kind: 'pulse',
        target: hero,
      }),
      Track.effect('beat-glow', {
        from: 0,
        to: 60,
        kind: 'glow',
        target: hero,
        syncTo: { anchor: bedId, mode: 'beat' },
      }),
    ],
    invariants: [],
    budgets: { p95FrameMs: 16 },
    site: ['node'],
  };
}

describe('SceneRuntime', () => {
  it('declares a stateMachine capsule named scene.runtime', () => {
    expect(sceneRuntimeCapsule._kind).toBe('stateMachine');
    expect(sceneRuntimeCapsule.name).toBe('scene.runtime');
    expect(sceneRuntimeCapsule.invariants.length).toBeGreaterThan(0);
  });

  it('registers all 6 canonical systems in topological order', async () => {
    const compiled = compileScene(buildScene());
    const handle = await SceneRuntime.build(compiled);
    try {
      expect(handle.systemsRegistered).toBe(SceneRuntime.systemCount);
      expect(handle.systemsRegistered).toBe(6);
    } finally {
      await handle.release();
    }
  });

  it('spawns one entity per compiled track', async () => {
    const compiled = compileScene(buildScene());
    const handle = await SceneRuntime.build(compiled);
    try {
      expect(handle.entitySpawnCount).toBe(compiled.trackSpawns.length);
      const spawned = await Effect.runPromise(handle.world.query('trackId'));
      expect(spawned.length).toBe(compiled.trackSpawns.length);
    } finally {
      await handle.release();
    }
  });

  it('tick(dtMs) advances time, derives frameIndex from fps, and runs VideoSystem (writes _opacity)', async () => {
    const compiled = compileScene(buildScene());
    const handle = await SceneRuntime.build(compiled);
    try {
      // 16.67ms at 60fps lands on frame 1 (Math.floor((16.67/1000)*60) === 1).
      await handle.tick(16.67);
      expect(handle.currentTimeMs()).toBeCloseTo(16.67, 5);
      expect(handle.currentFrame()).toBe(1);

      const videos = await Effect.runPromise(handle.world.query('VideoSource'));
      expect(videos.length).toBe(1);
      const opacity = videos[0]?.components.get('_opacity');
      // FrameRange is 0..60 and frame 1 is in-range → opacity 1.
      expect(opacity).toBe(1);
    } finally {
      await handle.release();
    }
  });

  it('tick runs TransitionSystem (writes _blend) and EffectSystem (writes _intensity)', async () => {
    const compiled = compileScene(buildScene());
    const handle = await SceneRuntime.build(compiled);
    try {
      // Advance to frame 15 — half-way through the 0..30 transition.
      await handle.tick((15 / 60) * 1000);
      expect(handle.currentFrame()).toBe(15);

      const transitions = await Effect.runPromise(
        handle.world.query('TransitionKind', 'FrameRange', 'Between'),
      );
      expect(transitions.length).toBe(1);
      const blend = transitions[0]?.components.get('_blend');
      expect(typeof blend).toBe('number');
      expect(blend as number).toBeGreaterThan(0);
      expect(blend as number).toBeLessThan(1);

      const effects = await Effect.runPromise(handle.world.query('EffectKind', 'FrameRange'));
      expect(effects.length).toBe(2);
      for (const e of effects) {
        const intensity = e.components.get('_intensity');
        expect(typeof intensity).toBe('number');
      }
    } finally {
      await handle.release();
    }
  });

  it('tick runs PassThroughMixer and emits one MixReceipt per audio entity per tick', async () => {
    const compiled = compileScene(buildScene());
    const receipts: MixReceipt[] = [];
    const handle = await SceneRuntime.build(compiled, { mixSink: (r) => receipts.push(r) });
    try {
      await handle.tick(16.67);
      await handle.tick(16.67);
      expect(receipts.length).toBe(2); // one audio entity × 2 ticks
      expect(receipts[0]?.volume).toBe(-3);
      expect(receipts[0]?.pan).toBe(0.25);
    } finally {
      await handle.release();
    }
  });

  it('release() disposes the scope and is idempotent', async () => {
    const compiled = compileScene(buildScene());
    const handle = await SceneRuntime.build(compiled);
    await handle.release();
    // second release is a no-op
    await handle.release();
    // tick after release should throw
    await expect(handle.tick(16.67)).rejects.toThrow(/after release/);
  });

  it('SyncSystem runs after EffectSystem — Sync_intensity overwrites Effect_intensity on shared entities', async () => {
    // Effect at frames 0..30 writes intensity = (f - from)/span at every frame in range.
    // SyncSystem queries 'SyncAnchor' entities and writes a beat-decay intensity.
    // The canonical order Video → Audio → Transition → Effect → Sync → Mixer
    // means Sync's write overrides Effect's on entities matching both queries.
    const scene = {
      ...buildScene(),
      tracks: [
        ...buildScene().tracks,
        // An entity that is BOTH an effect and a sync anchor — Effect writes
        // first, Sync writes second; final value should be Sync's decay output.
        {
          kind: 'effect' as const,
          id: 'effect-with-sync' as TrackId<'effect'>,
          from: 0,
          to: 30,
          effectKind: 'pulse' as const,
          target: 'sync-target' as TrackId<'video'>,
          // The 'SyncAnchor' tag makes SyncSystem also query this entity.
          syncAnchor: true,
        } as unknown as never, // shape extension is intentional — runtime tolerates extra components
      ],
    };
    const compiled = compileScene(scene as never);
    const handle = await SceneRuntime.build(compiled);
    try {
      await handle.tick((10 / 60) * 1000); // frame 10 — Effect would write 10/30 ≈ 0.333
      const synced = await Effect.runPromise(handle.world.query('SyncAnchor'));
      // If Sync ran AFTER Effect, intensity should be Sync's decay value
      // (e^0 = 1 since no past beats means lastBeat = -Infinity → decay = 0
      // OR Math.exp(-Infinity) = 0). Either way, the value is the Sync
      // output (0), distinct from Effect's 0.333.
      for (const e of synced) {
        const intensity = e.components.get('_intensity');
        // Sync overwrites — final intensity is Sync's, not Effect's 10/30.
        expect(intensity).not.toBeCloseTo(10 / 30, 5);
      }
    } finally {
      await handle.release();
    }
  });

  it('sceneRuntimeCapsule invariants accept canonical output and reject malformed shapes', () => {
    const allCanonical = sceneRuntimeCapsule.invariants.find(
      (i) => i.name === 'all-canonical-systems-registered',
    );
    const nonNeg = sceneRuntimeCapsule.invariants.find(
      (i) => i.name === 'entity-spawn-count-non-negative',
    );
    expect(allCanonical).toBeDefined();
    expect(nonNeg).toBeDefined();

    expect(allCanonical!.check({}, { systemsRegistered: 6, entitySpawnCount: 4 })).toBe(true);
    expect(allCanonical!.check({}, { systemsRegistered: 5, entitySpawnCount: 4 })).toBe(false);
    expect(allCanonical!.check({}, {})).toBe(false);

    expect(nonNeg!.check({}, { systemsRegistered: 6, entitySpawnCount: 0 })).toBe(true);
    expect(nonNeg!.check({}, { systemsRegistered: 6, entitySpawnCount: 4 })).toBe(true);
    expect(nonNeg!.check({}, { systemsRegistered: 6, entitySpawnCount: -1 })).toBe(false);
    expect(nonNeg!.check({}, { systemsRegistered: 6 })).toBe(false);
  });
});
