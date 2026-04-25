/**
 * SpeculativeEvaluator -- threshold proximity detection and velocity extrapolation.
 */

import { describe, test, expect, vi } from 'vitest';
import { Boundary, SpeculativeEvaluator } from '@czap/core';

const boundary = Boundary.make({
  input: 'width',
  at: [
    [0, 'small'],
    [500, 'medium'],
    [1000, 'large'],
  ] as const,
  hysteresis: 20,
});

describe('SpeculativeEvaluator', () => {
  test('evaluates current state correctly', () => {
    const spec = SpeculativeEvaluator.make(boundary);
    const result = spec.evaluate(100);
    expect(result.current).toBe('small');
    expect(result.confidence).toBe(0);
  });

  test('returns no prefetch when far from threshold', () => {
    const spec = SpeculativeEvaluator.make(boundary);
    const result = spec.evaluate(250);
    expect(result.prefetched).toBeUndefined();
  });

  test('returns prefetch when near threshold with velocity', () => {
    const spec = SpeculativeEvaluator.make(boundary);

    // Build velocity history by evaluating sequential values approaching threshold
    spec.evaluate(480);
    spec.evaluate(485);
    spec.evaluate(490);
    const result = spec.evaluate(495, 10); // Explicit velocity toward 500

    expect(result.current).toBe('small');
    // With explicit velocity toward threshold, should predict crossing
    expect(result.prefetched).toBe('medium');
    expect(result.confidence).toBeGreaterThan(0);
  });

  test('returns downward prefetch when descending toward the previous threshold', () => {
    const spec = SpeculativeEvaluator.make(boundary);
    spec.evaluate(520);
    spec.evaluate(515);
    spec.evaluate(510);
    const result = spec.evaluate(501, -10);

    expect(result.current).toBe('medium');
    expect(result.prefetched).toBe('small');
    expect(result.confidence).toBeGreaterThan(0);
  });

  test('no prefetch when moving away from threshold', () => {
    const spec = SpeculativeEvaluator.make(boundary);
    spec.evaluate(495);
    spec.evaluate(490);
    spec.evaluate(485);
    const result = spec.evaluate(480, -10); // Moving away

    expect(result.prefetched).toBeUndefined();
  });

  test('works with boundary without hysteresis', () => {
    const simpleB = Boundary.make({
      input: 'x',
      at: [
        [0, 'low'],
        [100, 'high'],
      ] as const,
    });

    const spec = SpeculativeEvaluator.make(simpleB);
    const result = spec.evaluate(50);
    expect(result.current).toBe('low');
  });

  test('confidence increases near threshold', () => {
    const spec = SpeculativeEvaluator.make(boundary);

    spec.evaluate(480);
    const far = spec.evaluate(490, 5);

    const spec2 = SpeculativeEvaluator.make(boundary);
    spec2.evaluate(495);
    const near = spec2.evaluate(498, 5);

    // Near threshold should have higher confidence
    expect(far.confidence).toBeGreaterThan(0);
    expect(near.confidence).toBeGreaterThan(0);
    expect(near.confidence).toBeGreaterThanOrEqual(far.confidence);
  });

  test('falls back to Date.now when performance is unavailable and drops oldest history after four samples', () => {
    const originalPerformance = globalThis.performance;
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1234);
    // @ts-expect-error intentional environment mutation for branch coverage
    delete globalThis.performance;

    try {
      const spec = SpeculativeEvaluator.make(boundary);
      spec.evaluate(480);
      spec.evaluate(485);
      spec.evaluate(490);
      spec.evaluate(495);
      const result = spec.evaluate(498, 5);

      expect(result.current).toBe('small');
      expect(result.confidence).toBeGreaterThan(0);
      expect(nowSpy).toHaveBeenCalled();
    } finally {
      globalThis.performance = originalPerformance;
      nowSpy.mockRestore();
    }
  });

  test('treats zero or negative elapsed time as zero velocity when inferring history', () => {
    const now = vi.spyOn(performance, 'now');
    now.mockReturnValue(100);

    try {
      const spec = SpeculativeEvaluator.make(boundary);
      spec.evaluate(480);
      const result = spec.evaluate(495);

      expect(result.prefetched).toBeUndefined();
      expect(result.confidence).toBe(0);
    } finally {
      now.mockRestore();
    }
  });

  test('clears speculative confidence when the predicted state matches the current state', () => {
    const sameStateBoundary = {
      thresholds: [0, 100],
      states: ['steady', 'steady'],
      hysteresis: 10,
    } as never;

    const spec = SpeculativeEvaluator.make(sameStateBoundary);
    spec.evaluate(95);
    const result = spec.evaluate(99, 4);

    expect(result.current).toBe('steady');
    expect(result.prefetched).toBeUndefined();
    expect(result.confidence).toBe(0);
  });

  test('returns zero confidence when a defensive thresholdless boundary exposes no nearest threshold', () => {
    const thresholdless = {
      thresholds: [],
      states: ['only'],
      hysteresis: 10,
    } as never;

    const spec = SpeculativeEvaluator.make(thresholdless);
    const result = spec.evaluate(5, 1);

    expect(result.current).toBe('only');
    expect(result.prefetched).toBeUndefined();
    expect(result.confidence).toBe(0);
  });
});
