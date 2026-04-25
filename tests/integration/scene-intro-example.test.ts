import { describe, it, expect } from 'vitest';
import { Effect } from 'effect';
import { SceneRuntime } from '@czap/scene';
import { intro, introContract, compileIntro } from '../../examples/scenes/intro.js';

describe('examples.intro scene capsule', () => {
  it('is a registered sceneComposition capsule', () => {
    expect(intro._kind).toBe('sceneComposition');
    expect(intro.name).toBe('examples.intro');
  });

  it('contract declares 6 tracks', () => {
    expect(introContract.tracks.length).toBe(6);
  });

  it('compiles into a CompiledScene with 6 trackSpawns', () => {
    const compiled = compileIntro();
    expect(compiled.trackSpawns.length).toBe(6);
  });

  it('runtime spawns 6 entities and registers 6 systems', async () => {
    const compiled = compileIntro();
    const handle = await SceneRuntime.build(compiled);
    try {
      expect(handle.entitySpawnCount).toBe(6);
      expect(handle.systemsRegistered).toBe(6);
      const entities = await Effect.runPromise(handle.world.query('trackId'));
      expect(entities.length).toBe(6);
    } finally {
      await handle.release();
    }
  });

  it('compiles identically across three consecutive runs (structural determinism)', () => {
    const hashes: string[] = [];
    for (let i = 0; i < 3; i++) {
      const compiled = compileIntro();
      const sig = compiled.trackSpawns
        .map(
          (t) =>
            String(t.trackId) +
            JSON.stringify(
              Object.entries(t.components).sort(([a], [b]) => a.localeCompare(b)),
            ),
        )
        .sort()
        .join('|');
      hashes.push(sig);
    }
    expect(hashes[0]).toBe(hashes[1]);
    expect(hashes[1]).toBe(hashes[2]);
  });
});
