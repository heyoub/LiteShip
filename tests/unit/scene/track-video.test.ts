import { describe, it, expect } from 'vitest';
import { Track } from '@czap/scene';

describe('Track.video', () => {
  it('builds a VideoTrack with default layer=0', () => {
    const t = Track.video('hero', { from: 0, to: 60, source: { _t: 'quantizer' } });
    expect(t.kind).toBe('video');
    expect(t.id).toBe('hero');
    expect(t.layer).toBe(0);
    expect(t.from).toBe(0);
    expect(t.to).toBe(60);
  });

  it('honors an explicit layer', () => {
    const t = Track.video('bg', { from: 0, to: 10, source: {}, layer: 2 });
    expect(t.layer).toBe(2);
  });
});
