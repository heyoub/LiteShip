import { describe, expect, test, vi } from 'vitest';
import { Boundary, BoundarySpec } from '@czap/core';

describe('Boundary.make', () => {
  test('creates a content-addressed boundary from ascending thresholds', () => {
    const boundary = Boundary.make({
      input: 'viewport.width',
      at: [
        [0, 'mobile'],
        [768, 'tablet'],
        [1280, 'desktop'],
      ] as const,
      hysteresis: 24,
    });

    expect(boundary._tag).toBe('BoundaryDef');
    expect(boundary._version).toBe(1);
    expect(boundary.id).toMatch(/^fnv1a:/);
    expect(boundary.hysteresis).toBe(24);
  });

  test('changes content address when spec changes', () => {
    const base = Boundary.make({
      input: 'viewport.width',
      at: [
        [0, 'mobile'],
        [768, 'tablet'],
      ] as const,
    });

    const withSpec = Boundary.make({
      input: 'viewport.width',
      at: [
        [0, 'mobile'],
        [768, 'tablet'],
      ] as const,
      spec: {
        experimentId: 'exp-a',
      },
    });

    expect(withSpec.id).not.toBe(base.id);
  });

  test('rejects non-ascending thresholds', () => {
    expect(() =>
      Boundary.make({
        input: 'viewport.width',
        at: [
          [0, 'mobile'],
          [768, 'tablet'],
          [768, 'desktop'],
        ] as const,
      }),
    ).toThrow(/strictly ascending/);
  });

  test('rejects duplicate state names', () => {
    expect(() =>
      Boundary.make({
        input: 'viewport.width',
        at: [
          [0, 'mobile'],
          [768, 'mobile'],
        ] as const,
      }),
    ).toThrow(/duplicate state name/);
  });
});

describe('Boundary.evaluate', () => {
  const boundary = Boundary.make({
    input: 'viewport.width',
    at: [
      [0, 'mobile'],
      [768, 'tablet'],
      [1280, 'desktop'],
    ] as const,
  });

  test('returns the first state below the first threshold crossing', () => {
    expect(Boundary.evaluate(boundary, 320)).toBe('mobile');
  });

  test('returns the matching middle and upper states', () => {
    expect(Boundary.evaluate(boundary, 900)).toBe('tablet');
    expect(Boundary.evaluate(boundary, 1600)).toBe('desktop');
  });
});

describe('Boundary.evaluateWithHysteresis', () => {
  const boundary = Boundary.make({
    input: 'viewport.width',
    at: [
      [0, 'mobile'],
      [768, 'tablet'],
      [1280, 'desktop'],
    ] as const,
    hysteresis: 40,
  });

  test('falls back to raw evaluation when hysteresis is disabled or previous state is unknown', () => {
    const noHysteresis = Boundary.make({
      input: 'viewport.width',
      at: [
        [0, 'mobile'],
        [768, 'tablet'],
      ] as const,
    });

    expect(Boundary.evaluateWithHysteresis(noHysteresis, 900, 'mobile')).toBe('tablet');
    expect(Boundary.evaluateWithHysteresis(boundary, 900, 'unknown' as never)).toBe('tablet');
  });

  test('suppresses upward crossings inside the dead zone', () => {
    expect(Boundary.evaluateWithHysteresis(boundary, 780, 'mobile')).toBe('mobile');
    expect(Boundary.evaluateWithHysteresis(boundary, 789, 'mobile')).toBe('tablet');
  });

  test('suppresses downward crossings inside the dead zone', () => {
    expect(Boundary.evaluateWithHysteresis(boundary, 1265, 'desktop')).toBe('desktop');
    expect(Boundary.evaluateWithHysteresis(boundary, 1200, 'desktop')).toBe('tablet');
  });
});

describe('Boundary.isActive / BoundarySpec.isActive', () => {
  test('returns true when no spec is present', () => {
    const boundary = Boundary.make({
      input: 'viewport.width',
      at: [
        [0, 'mobile'],
        [768, 'tablet'],
      ] as const,
    });

    expect(Boundary.isActive(boundary)).toBe(true);
  });

  test('respects device, time-range, and experiment filters', () => {
    const spec = {
      deviceFilter: (capabilities: Record<string, unknown>) => capabilities['gpu'] === true,
      timeRange: { from: 100, until: 200 },
      experimentId: 'exp-a',
    };

    expect(
      BoundarySpec.isActive(spec, {
        capabilities: { gpu: true },
        nowMs: 150,
        activeExperiments: ['exp-a'],
      }),
    ).toBe(true);

    expect(
      BoundarySpec.isActive(spec, {
        capabilities: { gpu: false },
        nowMs: 150,
        activeExperiments: ['exp-a'],
      }),
    ).toBe(false);

    expect(
      BoundarySpec.isActive(spec, {
        capabilities: { gpu: true },
        nowMs: 250,
        activeExperiments: ['exp-a'],
      }),
    ).toBe(false);

    expect(
      BoundarySpec.isActive(spec, {
        capabilities: { gpu: true },
        nowMs: 150,
        activeExperiments: ['exp-b'],
      }),
    ).toBe(false);
  });

  test('treats missing time windows as open-ended and rejects values before the start time', () => {
    expect(
      BoundarySpec.isActive(
        {
          timeRange: { from: 100 },
        },
        {
          nowMs: 99,
        },
      ),
    ).toBe(false);

    expect(
      BoundarySpec.isActive(
        {
          experimentId: 'exp-b',
        },
        {
          activeExperiments: ['exp-b'],
        },
      ),
    ).toBe(true);
  });

  test('treats missing context as non-blocking except for time ranges and uses Date.now fallback', () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(150);
    const spec = {
      deviceFilter: () => false,
      timeRange: { from: 100, until: 200 },
      experimentId: 'exp-a',
    } satisfies Boundary.Spec;

    expect(BoundarySpec.isActive(spec)).toBe(true);
    expect(BoundarySpec.isActive({ timeRange: { until: 125 } })).toBe(false);

    nowSpy.mockRestore();
  });
});
