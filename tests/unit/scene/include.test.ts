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

  it('shifts and prefixes audio tracks', () => {
    const audioSub: SceneContract = {
      ...sub,
      tracks: [Track.audio('bed', { from: 5, to: 25, source: 'bed' })],
    };
    const out = Scene.include(audioSub, { offset: 100 });
    expect(out).toHaveLength(1);
    const t = out[0]!;
    expect(t.kind).toBe('audio');
    expect(t.id).toBe('sub/bed');
    expect(t.from).toBe(105);
    expect(t.to).toBe(125);
  });

  it('shifts and prefixes transition tracks (and the between TrackIds)', () => {
    const a = Track.videoId('a');
    const b = Track.videoId('b');
    const transSub: SceneContract = {
      ...sub,
      tracks: [
        Track.video('a', { from: 0, to: 30, source: {} }),
        Track.video('b', { from: 0, to: 30, source: {} }),
        Track.transition('xfade', { from: 10, to: 20, kind: 'crossfade', between: [a, b] }),
      ],
    };
    const out = Scene.include(transSub, { offset: 50 });
    const trans = out.find((t) => t.kind === 'transition')!;
    expect(trans.id).toBe('sub/xfade');
    expect(trans.from).toBe(60);
    expect(trans.to).toBe(70);
    if (trans.kind === 'transition') {
      expect(trans.between[0]).toBe('sub/a');
      expect(trans.between[1]).toBe('sub/b');
    }
  });

  it('shifts and prefixes effect tracks (target + syncTo.anchor)', () => {
    const target = Track.videoId('hero');
    const anchor = Track.audioId('bed');
    const effectSub: SceneContract = {
      ...sub,
      tracks: [
        Track.video('hero', { from: 0, to: 30, source: {} }),
        Track.audio('bed', { from: 0, to: 30, source: 'bed' }),
        Track.effect('glow', {
          from: 5, to: 25, kind: 'glow', target,
          syncTo: { anchor, mode: 'beat' },
        }),
      ],
    };
    const out = Scene.include(effectSub, { offset: 200 });
    const fx = out.find((t) => t.kind === 'effect')!;
    expect(fx.id).toBe('sub/glow');
    expect(fx.from).toBe(205);
    expect(fx.to).toBe(225);
    if (fx.kind === 'effect') {
      expect(fx.target).toBe('sub/hero');
      expect(fx.syncTo?.anchor).toBe('sub/bed');
    }
  });

  it('preserves an effect track without syncTo', () => {
    const target = Track.videoId('hero');
    const fxSub: SceneContract = {
      ...sub,
      tracks: [
        Track.video('hero', { from: 0, to: 30, source: {} }),
        Track.effect('pulse', { from: 0, to: 30, kind: 'pulse', target }),
      ],
    };
    const out = Scene.include(fxSub, { offset: 10 });
    const fx = out.find((t) => t.kind === 'effect')!;
    if (fx.kind === 'effect') {
      expect(fx.syncTo).toBeUndefined();
      expect(fx.target).toBe('sub/hero');
    }
  });
});

describe('Scene.subscene', () => {
  it('inherits parent bpm/fps when child does not declare them', () => {
    const out = Scene.subscene({ bpm: 120, fps: 60 }, {
      name: 'child', duration: 1000,
      tracks: [], invariants: [], budgets: { p95FrameMs: 16 }, site: ['node'],
    });
    expect(out.bpm).toBe(120);
    expect(out.fps).toBe(60);
  });

  it('child explicit bpm/fps win over parent inheritance', () => {
    const out = Scene.subscene({ bpm: 120, fps: 60 }, {
      name: 'child', duration: 1000, bpm: 90, fps: 30,
      tracks: [], invariants: [], budgets: { p95FrameMs: 16 }, site: ['node'],
    });
    expect(out.bpm).toBe(90);
    expect(out.fps).toBe(30);
  });
});
