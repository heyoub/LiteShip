import { Boundary } from '@czap/core';

export type ThroughputTier = 'very-low' | 'low' | 'moderate' | 'high' | 'very-high';

const throughputBoundary = Boundary.make({
  input: 'ops-per-sec',
  at: [
    [0, 'very-low'],
    [100_000, 'low'],
    [1_000_000, 'moderate'],
    [10_000_000, 'high'],
    [100_000_000, 'very-high'],
  ] as const,
});

export function classifyThroughputTier(opsPerSec: number): ThroughputTier {
  return Boundary.evaluate(throughputBoundary, opsPerSec) as ThroughputTier;
}

export function throughputTierBadge(tier: ThroughputTier): string {
  switch (tier) {
    case 'very-high':
      return '[++]';
    case 'high':
      return '[+ ]';
    case 'moderate':
      return '[= ]';
    case 'low':
      return '[- ]';
    case 'very-low':
    default:
      return '[--]';
  }
}
