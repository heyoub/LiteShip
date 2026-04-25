import { describe, it, expect } from 'vitest';
import { computeWaveform, WaveformProjection } from '@czap/assets';

describe('WaveformProjection', () => {
  it('computeWaveform returns a normalized downsampled array', () => {
    const sampleRate = 48000;
    const samples = new Float32Array(sampleRate);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.sin((i / sampleRate) * 2 * Math.PI * 440) * 0.5;
    const wave = computeWaveform({ sampleRate, samples }, { bins: 100 });
    expect(wave.length).toBe(100);
    for (const v of wave) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('handles Int16Array sample buffers', () => {
    const sampleRate = 48000;
    const samples = new Int16Array(sampleRate);
    for (let i = 0; i < samples.length; i++) samples[i] = 10000;
    const wave = computeWaveform({ sampleRate, samples }, { bins: 16 });
    expect(wave.length).toBe(16);
  });

  it('returns all-zero bins for a silent buffer (max-RMS short circuit)', () => {
    const samples = new Float32Array(48000);
    const wave = computeWaveform({ sampleRate: 48000, samples }, { bins: 32 });
    expect(wave.length).toBe(32);
    // No normalization should run when maxRms === 0.
    for (const v of wave) expect(v).toBe(0);
  });

  it('clamps stride to 1 when bins exceed sample count', () => {
    const samples = new Float32Array(8);
    samples[0] = 1; samples[1] = -1;
    const wave = computeWaveform({ sampleRate: 48000, samples }, { bins: 64 });
    expect(wave.length).toBe(64);
  });

  it('WaveformProjection is a cachedProjection capsule with bin suffix in name', () => {
    const cap = WaveformProjection('intro-bed', { bins: 512 });
    expect(cap._kind).toBe('cachedProjection');
    expect(cap.name).toBe('intro-bed:waveform:512');
  });

  it('WaveformProjection invariants reject malformed output', () => {
    const cap = WaveformProjection('intro-bed', { bins: 4 });
    const binInv = cap.invariants.find((i) => i.name === 'bin-count-matches');
    const normInv = cap.invariants.find((i) => i.name === 'values-normalized');
    expect(binInv).toBeDefined();
    expect(normInv).toBeDefined();
    expect(binInv!.check(undefined, [0, 0, 0])).toBe(false);
    expect(binInv!.check(undefined, [0, 0, 0, 0])).toBe(true);
    expect(normInv!.check(undefined, [0, 0.5, 1, 1.5])).toBe(false);
    expect(normInv!.check(undefined, [0, 0.5, 1, 0.25])).toBe(true);
  });
});
