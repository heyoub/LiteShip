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

  it('WaveformProjection is a cachedProjection capsule with bin suffix in name', () => {
    const cap = WaveformProjection('intro-bed', { bins: 512 });
    expect(cap._kind).toBe('cachedProjection');
    expect(cap.name).toBe('intro-bed:waveform:512');
  });
});
