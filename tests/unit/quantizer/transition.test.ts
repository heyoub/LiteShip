/**
 * Transition -- state crossing transition configuration.
 *
 * Resolution order: exact match -> wildcard -> instant (duration: 0).
 */

import { describe, test, expect } from 'vitest';
import { Boundary, Millis } from '@czap/core';
import { Transition } from '@czap/quantizer';
import type { TransitionConfig } from '@czap/quantizer';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const boundary = Boundary.make({
  input: 'width',
  at: [
    [0, 'mobile'],
    [768, 'tablet'],
    [1024, 'desktop'],
  ] as const,
});

// Minimal quantizer stub for Transition.for()
const stubQuantizer = {
  boundary,
  state: null as any,
  changes: null as any,
  evaluate: () => 'mobile' as const,
};

// ---------------------------------------------------------------------------
// Resolution order
// ---------------------------------------------------------------------------

describe('Transition.for', () => {
  test('returns a Transition with config and getTransition', () => {
    const t = Transition.for(stubQuantizer, {});
    expect(t.config).toBeDefined();
    expect(t.getTransition).toBeDefined();
  });

  test('exact match takes priority', () => {
    const exactConfig: TransitionConfig = { duration: Millis(300) };
    const wildcardConfig: TransitionConfig = { duration: Millis(100) };

    const t = Transition.for(stubQuantizer, {
      'mobile->tablet': exactConfig,
      '*': wildcardConfig,
    });

    const result = t.getTransition('mobile', 'tablet');
    expect(result.duration).toBe(Millis(300));
  });

  test('wildcard used when no exact match', () => {
    const wildcardConfig: TransitionConfig = { duration: Millis(200) };

    const t = Transition.for(stubQuantizer, {
      '*': wildcardConfig,
    });

    const result = t.getTransition('mobile', 'desktop');
    expect(result.duration).toBe(Millis(200));
  });

  test('instant fallback when no config at all', () => {
    const t = Transition.for(stubQuantizer, {});

    const result = t.getTransition('mobile', 'desktop');
    expect(result.duration).toBe(Millis(0));
  });

  test('from == to still resolves', () => {
    const t = Transition.for(stubQuantizer, {
      '*': { duration: Millis(100) },
    });

    const result = t.getTransition('mobile', 'mobile');
    expect(result.duration).toBe(Millis(100));
  });

  test('duration 0 is valid (instant transition)', () => {
    const t = Transition.for(stubQuantizer, {
      'mobile->tablet': { duration: Millis(0) },
    });

    const result = t.getTransition('mobile', 'tablet');
    expect(result.duration).toBe(0);
  });

  test('easing and delay are optional', () => {
    const t = Transition.for(stubQuantizer, {
      '*': { duration: Millis(100) },
    });

    const result = t.getTransition('mobile', 'tablet');
    expect(result.easing).toBeUndefined();
    expect(result.delay).toBeUndefined();
  });

  test('easing and delay are preserved when provided', () => {
    const easing = (t: number) => t * t;
    const t = Transition.for(stubQuantizer, {
      '*': { duration: Millis(100), easing, delay: Millis(50) },
    });

    const result = t.getTransition('mobile', 'tablet');
    expect(result.easing).toBe(easing);
    expect(result.delay).toBe(Millis(50));
  });

  test('config is accessible', () => {
    const config = { '*': { duration: Millis(100) } };
    const t = Transition.for(stubQuantizer, config);
    expect(t.config).toBe(config);
  });
});
