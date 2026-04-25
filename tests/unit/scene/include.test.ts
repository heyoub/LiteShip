import { describe, it, expect } from 'vitest';
import { Scene, Track } from '@czap/scene';
import type { SceneContract } from '@czap/scene';

describe('Scene.include', () => {
  const sub: SceneContract = {
    name: 'sub', duration: 30, fps: 60, bpm: 120,
    tracks: [Track.video('a', { from: 0, to: 30, source: {} })],
    invariants: [], budgets: { p95FrameMs: 16 }, site: ['node'],
  };

  it('shifts every track in the sub-scene by the given offset', () => {
    const included = Scene.include(sub, { offset: 60 });
    expect(included[0]?.from).toBe(60);
    expect(included[0]?.to).toBe(90);
  });

  it('prefixes included track ids with the sub-scene name', () => {
    const included = Scene.include(sub, { offset: 0 });
    expect(included[0]?.id).toBe('sub/a');
  });
});
