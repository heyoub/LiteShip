import { describe, it, expect } from 'vitest';
import { detectOnsets, OnsetProjection } from '@czap/assets';

describe('OnsetProjection', () => {
  it('detectOnsets returns sample indices where energy rises sharply', () => {
    const sampleRate = 48000;
    const samples = new Float32Array(sampleRate);
    for (let i = 0; i < 24000; i++) samples[i] = 0.01;
    for (let i = 24000; i < samples.length; i++) samples[i] = 0.9;
    const onsets = detectOnsets({ sampleRate, samples });
    expect(onsets.length).toBeGreaterThan(0);
    expect(onsets[0]).toBeGreaterThan(20000);
    expect(onsets[0]).toBeLessThan(28000);
  });

  it('OnsetProjection is a cachedProjection capsule', () => {
    const cap = OnsetProjection('intro-bed');
    expect(cap._kind).toBe('cachedProjection');
    expect(cap.name).toBe('intro-bed:onsets');
  });
});
