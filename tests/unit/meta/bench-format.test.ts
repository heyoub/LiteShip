import { describe, expect, test } from 'vitest';
import { classifyThroughputTier, throughputTierBadge } from '../../../scripts/bench-format.ts';

describe('bench format helpers', () => {
  test('classifies throughput with neutral tier vocabulary', () => {
    expect(classifyThroughputTier(50_000)).toBe('very-low');
    expect(classifyThroughputTier(250_000)).toBe('low');
    expect(classifyThroughputTier(2_000_000)).toBe('moderate');
    expect(classifyThroughputTier(20_000_000)).toBe('high');
    expect(classifyThroughputTier(200_000_000)).toBe('very-high');
  });

  test('maps throughput tiers to neutral output badges', () => {
    expect(throughputTierBadge('very-low')).toBe('[--]');
    expect(throughputTierBadge('low')).toBe('[- ]');
    expect(throughputTierBadge('moderate')).toBe('[= ]');
    expect(throughputTierBadge('high')).toBe('[+ ]');
    expect(throughputTierBadge('very-high')).toBe('[++]');
  });
});
