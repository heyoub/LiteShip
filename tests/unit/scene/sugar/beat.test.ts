import { describe, it, expect } from 'vitest';
import { Beat, resolveBeat } from '@czap/scene';

describe('Beat', () => {
  it('tags a beat count without resolving to frames', () => {
    const b = Beat(4);
    expect(b._t).toBe('beat');
    expect(b.count).toBe(4);
  });

  it('resolveBeat converts using BPM + fps', () => {
    const f = resolveBeat(Beat(4), { bpm: 128, fps: 60 });
    expect(f).toBeCloseTo(112.5, 1);
  });

  it('resolveBeat accepts fractional beats', () => {
    const half = resolveBeat(Beat(0.5), { bpm: 120, fps: 60 });
    expect(half).toBeCloseTo(15, 1);
  });
});
