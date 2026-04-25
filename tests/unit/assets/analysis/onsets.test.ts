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

  it('returns an empty array for buffers shorter than one analysis frame', () => {
    const samples = new Float32Array(64);
    const onsets = detectOnsets({ sampleRate: 48000, samples });
    expect(onsets).toEqual([]);
  });

  it('detectOnsets results are strictly increasing', () => {
    const sampleRate = 48000;
    // Two distinct attacks with quiet bridges between them.
    const samples = new Float32Array(sampleRate * 2);
    for (let i = 12000; i < 14000; i++) samples[i] = 0.9;
    for (let i = 60000; i < 62000; i++) samples[i] = 0.9;
    const onsets = detectOnsets({ sampleRate, samples });
    for (let i = 1; i < onsets.length; i++) {
      expect(onsets[i]!).toBeGreaterThan(onsets[i - 1]!);
    }
  });

  it('handles Int16Array sample buffers', () => {
    const sampleRate = 48000;
    const samples = new Int16Array(sampleRate);
    for (let i = 24000; i < samples.length; i++) samples[i] = 25000;
    const onsets = detectOnsets({ sampleRate, samples });
    expect(Array.isArray(onsets)).toBe(true);
  });

  it('OnsetProjection is a cachedProjection capsule', () => {
    const cap = OnsetProjection('intro-bed');
    expect(cap._kind).toBe('cachedProjection');
    expect(cap.name).toBe('intro-bed:onsets');
  });

  it('OnsetProjection invariant rejects unordered output', () => {
    const cap = OnsetProjection('intro-bed');
    const inv = cap.invariants.find((i) => i.name === 'onsets-ordered');
    expect(inv).toBeDefined();
    expect(inv!.check(undefined, [10, 20, 15])).toBe(false);
    expect(inv!.check(undefined, [10, 20, 30])).toBe(true);
  });
});
