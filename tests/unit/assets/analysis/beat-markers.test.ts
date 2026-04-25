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

  it('returns empty result for a clip shorter than one analysis frame', () => {
    const samples = new Float32Array(64);
    const markers = detectBeats({ sampleRate: 48000, samples });
    expect(markers.bpm).toBe(0);
    expect(markers.beats).toEqual([]);
  });

  it('handles Int16Array sample buffers (decodeSamples PCM16 path)', () => {
    const sampleRate = 48000;
    const samples = new Int16Array(sampleRate * 2);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = (i % 16000 < 1500) ? 20000 : 100;
    }
    const markers = detectBeats({ sampleRate, samples });
    expect(markers.beats.length).toBeGreaterThan(0);
    expect(markers.bpm).toBeGreaterThan(40);
  });

  it('BeatMarkerProjection is a cachedProjection capsule', () => {
    const cap = BeatMarkerProjection('intro-bed');
    expect(cap._kind).toBe('cachedProjection');
    expect(cap.name).toBe('intro-bed:beats');
  });

  it('BeatMarkerProjection invariants reject out-of-order or out-of-range output', () => {
    const cap = BeatMarkerProjection('intro-bed');
    const orderedInv = cap.invariants.find((i) => i.name === 'beats-ordered');
    const bpmInv = cap.invariants.find((i) => i.name === 'bpm-in-range');
    expect(orderedInv).toBeDefined();
    expect(bpmInv).toBeDefined();
    expect(orderedInv!.check(undefined, { bpm: 120, beats: [0, 100, 50] })).toBe(false);
    expect(orderedInv!.check(undefined, { bpm: 120, beats: [0, 100, 200] })).toBe(true);
    expect(bpmInv!.check(undefined, { bpm: 30, beats: [] })).toBe(false);
    expect(bpmInv!.check(undefined, { bpm: 120, beats: [] })).toBe(true);
  });
});
