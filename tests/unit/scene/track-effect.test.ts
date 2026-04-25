import { describe, it, expect } from 'vitest';
import { Track } from '@czap/scene';

describe('Track.effect', () => {
  const hero = Track.videoId('hero');
  const bed = Track.audioId('bed');

  it('builds an EffectTrack with optional syncTo', () => {
    const t = Track.effect('pulse', {
      from: 0, to: 60, kind: 'pulse', target: hero,
      syncTo: { anchor: bed, mode: 'beat' },
    });
    expect(t.kind).toBe('effect');
    expect(t.effectKind).toBe('pulse');
    expect(t.target).toBe('hero');
    expect(t.syncTo?.mode).toBe('beat');
  });

  it('syncTo is optional', () => {
    const t = Track.effect('glow', { from: 0, to: 30, kind: 'glow', target: hero });
    expect(t.syncTo).toBeUndefined();
  });
});
