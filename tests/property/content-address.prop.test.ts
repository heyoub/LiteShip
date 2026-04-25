/**
 * Property test: Content addressing determinism.
 *
 * Same payload → same hash. Different payloads → different hashes (probabilistic).
 * Hash format matches expected patterns.
 */

import { describe, test, expect } from 'vitest';
import fc from 'fast-check';
import { Boundary } from '@czap/core';

describe('Content address properties', () => {
  test('same boundary config → same content address', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 0, max: 10000 }), { minLength: 2, maxLength: 6 }),
        (rawThresholds) => {
          const sorted = rawThresholds.sort((a, b) => a - b);
          const pairs = sorted.map((t, i) => [t, `state${i}`] as const);

          const b1 = Boundary.make({ input: 'x', at: pairs as any });
          const b2 = Boundary.make({ input: 'x', at: pairs as any });

          return b1.id === b2.id;
        },
      ),
    );
  });

  test('different inputs → different content addresses', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 0, max: 10000 }), { minLength: 2, maxLength: 6 }),
        (rawThresholds) => {
          const sorted = rawThresholds.sort((a, b) => a - b);
          const pairs = sorted.map((t, i) => [t, `state${i}`] as const);

          const b1 = Boundary.make({ input: 'width', at: pairs as any });
          const b2 = Boundary.make({ input: 'height', at: pairs as any });

          return b1.id !== b2.id;
        },
      ),
    );
  });

  test('content address format is fnv1a:XXXXXXXX', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 0, max: 10000 }), { minLength: 2, maxLength: 6 }),
        (rawThresholds) => {
          const sorted = rawThresholds.sort((a, b) => a - b);
          const pairs = sorted.map((t, i) => [t, `s${i}`] as const);
          const boundary = Boundary.make({ input: 'x', at: pairs as any });
          return /^fnv1a:[0-9a-f]{8}$/.test(boundary.id);
        },
      ),
    );
  });

  test('adding hysteresis changes content address', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 0, max: 10000 }), { minLength: 2, maxLength: 6 }),
        fc.integer({ min: 1, max: 100 }),
        (rawThresholds, hysteresis) => {
          const sorted = rawThresholds.sort((a, b) => a - b);
          const pairs = sorted.map((t, i) => [t, `s${i}`] as const);

          const b1 = Boundary.make({ input: 'x', at: pairs as any });
          const b2 = Boundary.make({ input: 'x', at: pairs as any, hysteresis });

          return b1.id !== b2.id;
        },
      ),
    );
  });
});
