/**
 * Integration test for the `scene.beat-binding` sceneComposition arm
 * capsule. Asserts that:
 *
 *   1. `compileScene` propagates declared beats onto the CompiledScene.
 *   2. `SceneRuntime.build` spawns one Beat-tagged entity per beat.
 *   3. SyncSystem queries those entities each tick and writes a
 *      decay-shaped intensity onto SyncAnchor entities — closing
 *      bug #8 from the Spec 1 audit (closure-private `_beats` was
 *      always empty).
 *
 * Pure ECS data flow — no closure sidecar reads.
 */

import { describe, it, expect } from 'vitest';
import { Effect } from 'effect';
import {
  Track,
  compileScene,
  SceneRuntime,
  BeatBinding,
  beatBindingCapsule,
  bindBeats,
} from '@czap/scene';
import type { SceneContract, BeatComponent } from '@czap/scene';

function buildSceneWithBeats(beats: readonly BeatComponent[]): SceneContract {
  const heroId = Track.videoId('hero');
  const bedId = Track.audioId('bed');
  return {
    name: 'beat-binding-fixture',
    duration: 2000,
    fps: 60,
    bpm: 120,
    tracks: [
      Track.video('hero', { from: 0, to: 120, source: { _t: 'quantizer' } }),
      Track.audio('bed', { from: 0, to: 120, source: 'bed', mix: { volume: 0 } }),
      // An effect with syncTo.beat → this entity also carries a SyncAnchor
      // component so SyncSystem will pick it up and write _intensity.
      Track.effect('beat-glow', {
        from: 0,
        to: 120,
        kind: 'glow',
        target: heroId,
        syncTo: { anchor: bedId, mode: 'beat' },
      }),
    ],
    invariants: [],
    budgets: { p95FrameMs: 16 },
    site: ['node'],
    beats,
  };
}

describe('scene.beat-binding capsule (declaration)', () => {
  it('is registered as a sceneComposition capsule with the right name', () => {
    expect(beatBindingCapsule._kind).toBe('sceneComposition');
    expect(beatBindingCapsule.name).toBe('scene.beat-binding');
    expect(beatBindingCapsule.invariants.length).toBeGreaterThanOrEqual(2);
  });

  it('bindBeats produces one spawn descriptor per input beat', () => {
    const beats: readonly BeatComponent[] = [
      { kind: 'beat', timeMs: 0, strength: 1 },
      { kind: 'beat', timeMs: 500, strength: 0.8 },
      { kind: 'beat', timeMs: 1000, strength: 1 },
    ];
    const spawns = bindBeats(beats);
    expect(spawns.length).toBe(beats.length);
    for (let i = 0; i < beats.length; i++) {
      expect(spawns[i]?.components.kind).toBe('beat');
      expect(spawns[i]?.components.timeMs).toBe(beats[i]?.timeMs);
      expect(spawns[i]?.components.strength).toBe(beats[i]?.strength);
    }
  });

  it('BeatBinding namespace exposes the bind transform', () => {
    expect(typeof BeatBinding.bind).toBe('function');
    expect(BeatBinding.bind([])).toEqual([]);
  });
});

describe('beat-binding integration with SceneRuntime', () => {
  it('compileScene propagates declared beats onto the CompiledScene', () => {
    const beats: readonly BeatComponent[] = [
      { kind: 'beat', timeMs: 250, strength: 1 },
      { kind: 'beat', timeMs: 500, strength: 1 },
    ];
    const compiled = compileScene(buildSceneWithBeats(beats));
    expect(compiled.beats.length).toBe(2);
    expect(compiled.beats[0]?.timeMs).toBe(250);
    expect(compiled.beats[1]?.timeMs).toBe(500);
  });

  it('compiles to empty beats[] when the scene declares none', () => {
    const compiled = compileScene(buildSceneWithBeats([]));
    expect(compiled.beats.length).toBe(0);
  });

  it('SceneRuntime.build spawns one Beat-tagged entity per beat', async () => {
    const beats: readonly BeatComponent[] = [
      { kind: 'beat', timeMs: 250, strength: 1 },
      { kind: 'beat', timeMs: 500, strength: 1 },
      { kind: 'beat', timeMs: 750, strength: 1 },
    ];
    const compiled = compileScene(buildSceneWithBeats(beats));
    const handle = await SceneRuntime.build(compiled);
    try {
      const beatEntities = await Effect.runPromise(handle.world.query('Beat'));
      expect(beatEntities.length).toBe(beats.length);
      const spawnedTimes = beatEntities
        .map((e) => (e.components.get('Beat') as { timeMs: number }).timeMs)
        .sort((a, b) => a - b);
      expect(spawnedTimes).toEqual([250, 500, 750]);
    } finally {
      await handle.release();
    }
  });

  it('SyncSystem reads spawned Beat entities and writes intensity on tick', async () => {
    // Beat at t=500ms; tick to t=500ms (frame 30 at 60fps) so the most
    // recent beat is exactly now → exp(0) = 1.
    const beats: readonly BeatComponent[] = [{ kind: 'beat', timeMs: 500, strength: 1 }];
    const compiled = compileScene(buildSceneWithBeats(beats));
    const handle = await SceneRuntime.build(compiled);
    try {
      // 500 ms — exactly at the beat.
      await handle.tick(500);
      const synced = await Effect.runPromise(handle.world.query('SyncAnchor'));
      expect(synced.length).toBeGreaterThan(0);
      for (const e of synced) {
        const intensity = e.components.get('_intensity');
        expect(typeof intensity).toBe('number');
        // At the exact beat time, decay is exp(0) = 1.
        expect(intensity as number).toBeCloseTo(1, 2);
      }
    } finally {
      await handle.release();
    }
  });

  it('SyncSystem decays intensity for ticks after the beat', async () => {
    const beats: readonly BeatComponent[] = [{ kind: 'beat', timeMs: 0, strength: 1 }];
    const compiled = compileScene(buildSceneWithBeats(beats));
    const handle = await SceneRuntime.build(compiled);
    try {
      // 500 ms past the only beat → exp(-500/250) = exp(-2) ≈ 0.135.
      await handle.tick(500);
      const synced = await Effect.runPromise(handle.world.query('SyncAnchor'));
      expect(synced.length).toBeGreaterThan(0);
      for (const e of synced) {
        const intensity = e.components.get('_intensity') as number;
        expect(intensity).toBeGreaterThan(0);
        expect(intensity).toBeLessThan(0.5);
      }
    } finally {
      await handle.release();
    }
  });

  it('writes intensity = 0 when no beats have occurred yet', async () => {
    // The only beat is in the future relative to the tick time.
    const beats: readonly BeatComponent[] = [{ kind: 'beat', timeMs: 5000, strength: 1 }];
    const compiled = compileScene(buildSceneWithBeats(beats));
    const handle = await SceneRuntime.build(compiled);
    try {
      await handle.tick(100);
      const synced = await Effect.runPromise(handle.world.query('SyncAnchor'));
      for (const e of synced) {
        const intensity = e.components.get('_intensity');
        expect(intensity).toBe(0);
      }
    } finally {
      await handle.release();
    }
  });
});
