import { describe, it, expect } from 'vitest';
import { Track, compileScene, SceneRuntime } from '@czap/scene';
import type { SceneContract } from '@czap/scene';

describe('compileScene', () => {
  const hero = Track.videoId('hero');

  const scene: SceneContract = {
    name: 'demo',
    duration: 60,
    fps: 60,
    bpm: 120,
    tracks: [
      Track.video('hero', { from: 0, to: 60, source: {} }),
      Track.audio('bed', { from: 0, to: 60, source: 'bed' }),
      Track.transition('fade', { from: 0, to: 1, kind: 'crossfade', between: [hero, hero] }),
      Track.effect('pulse', { from: 0, to: 60, kind: 'pulse', target: hero }),
    ],
    invariants: [],
    budgets: { p95FrameMs: 16 },
    site: ['node'],
  };

  it('produces a CompiledScene descriptor with one trackSpawn per track', () => {
    const compiled = compileScene(scene);
    expect(compiled.trackSpawns.length).toBe(4);
    expect(compiled.name).toBe('demo');
    expect(compiled.fps).toBe(60);
    expect(compiled.bpm).toBe(120);
    // beats are filled by Task 9; vanilla compile leaves the array empty
    expect(compiled.beats).toEqual([]);
  });

  it('preserves trackId on each spawn', () => {
    const compiled = compileScene(scene);
    const ids = compiled.trackSpawns.map((s) => s.trackId);
    expect(ids).toContain('hero');
    expect(ids).toContain('bed');
    expect(ids).toContain('fade');
    expect(ids).toContain('pulse');
  });

  it('runtime registers the 6 canonical systems and spawns one entity per track', async () => {
    const compiled = compileScene(scene);
    const handle = await SceneRuntime.build(compiled);
    expect(handle.systemsRegistered).toBe(6);
    expect(handle.entitySpawnCount).toBe(4);
    await handle.release();
  });
});
