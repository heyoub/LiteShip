import { describe, it, expect } from 'vitest';
import { Layout, Track } from '@czap/scene';

describe('Layout', () => {
  const tracks = [
    Track.video('a', { from: 0, to: 60, source: {} }),
    Track.video('b', { from: 0, to: 60, source: {} }),
    Track.video('c', { from: 0, to: 60, source: {} }),
  ];

  it('stack assigns ascending layer values', () => {
    const out = Layout.stack(tracks);
    expect(out[0]?.layer).toBe(0);
    expect(out[1]?.layer).toBe(1);
    expect(out[2]?.layer).toBe(2);
  });

  it('grid(2) groups tracks into rows of 2 with layer=row', () => {
    const out = Layout.grid(2, tracks);
    expect(out[0]?.layer).toBe(0);
    expect(out[1]?.layer).toBe(0);
    expect(out[2]?.layer).toBe(1);
  });
});
