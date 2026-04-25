import { describe, it, expect } from 'vitest';
import { detectBeats, BeatMarkerProjection } from '@czap/assets';

describe('BeatMarkerProjection', () => {
  it('detectBeats returns ordered beats for a synthetic 120bpm pulse', () => {
    const sampleRate = 48000;
    const duration = 4;
    const samples = new Float32Array(sampleRate * duration);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = (i % 24000 < 2000) ? 0.9 : 0.01;
    }
    const markers = detectBeats({ sampleRate, samples });
    expect(markers.bpm).toBeGreaterThan(100);
    expect(markers.bpm).toBeLessThan(140);
    expect(markers.beats.length).toBeGreaterThan(4);
    for (let i = 1; i < markers.beats.length; i++) {
      expect(markers.beats[i]! - markers.beats[i - 1]!).toBeGreaterThan(0);
    }
  });

  it('BeatMarkerProjection is a cachedProjection capsule', () => {
    const cap = BeatMarkerProjection('intro-bed');
    expect(cap._kind).toBe('cachedProjection');
    expect(cap.name).toBe('intro-bed:beats');
  });
});
