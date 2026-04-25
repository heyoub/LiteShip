import { describe, it, expect } from 'vitest';
import { Track } from '@czap/scene';

describe('Track.audio', () => {
  it('builds an AudioTrack with default mix', () => {
    const t = Track.audio('bed', { from: 0, to: 120, source: 'intro-bed' });
    expect(t.kind).toBe('audio');
    expect(t.source).toBe('intro-bed');
    expect(t.mix).toEqual({ volume: 0, pan: 0 });
  });

  it('merges user mix settings with defaults', () => {
    const t = Track.audio('bed', { from: 0, to: 120, source: 'x', mix: { volume: -6 } });
    expect(t.mix).toEqual({ volume: -6, pan: 0 });
  });
});
