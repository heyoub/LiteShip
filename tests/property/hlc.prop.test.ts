/**
 * Property test: HLC monotonicity and merge laws.
 */

import { describe, test } from 'vitest';
import fc from 'fast-check';
import { HLC } from '@czap/core';

// ---------------------------------------------------------------------------
// Arbitrary: HLC values
// ---------------------------------------------------------------------------

const arbHLC = fc.record({
  wall_ms: fc.integer({ min: 0, max: 2_000_000_000 }),
  counter: fc.integer({ min: 0, max: 1000 }),
  node_id: fc.constantFrom('a', 'b', 'c'),
});

describe('HLC properties', () => {
  test('increment is monotonic: compare(hlc, increment(hlc, now)) <= 0', () => {
    fc.assert(
      fc.property(arbHLC, fc.integer({ min: 0, max: 2_000_000_000 }), (hlc, now) => {
        const incremented = HLC.increment(hlc, now);
        return HLC.compare(hlc, incremented) <= 0;
      }),
    );
  });

  test('increment advances wall_ms to at least max(old_wall, now)', () => {
    fc.assert(
      fc.property(arbHLC, fc.integer({ min: 0, max: 2_000_000_000 }), (hlc, now) => {
        const incremented = HLC.increment(hlc, now);
        return incremented.wall_ms >= Math.max(hlc.wall_ms, now);
      }),
    );
  });

  test('merge picks max wall time', () => {
    fc.assert(
      fc.property(arbHLC, arbHLC, fc.integer({ min: 0, max: 2_000_000_000 }), (a, b, now) => {
        const merged = HLC.merge(a, b, now);
        return merged.wall_ms >= Math.max(a.wall_ms, b.wall_ms, now);
      }),
    );
  });

  test('merge preserves node_id of local clock', () => {
    fc.assert(
      fc.property(arbHLC, arbHLC, fc.integer({ min: 0, max: 2_000_000_000 }), (local, remote, now) => {
        const merged = HLC.merge(local, remote, now);
        return merged.node_id === local.node_id;
      }),
    );
  });

  test('compare is antisymmetric: if a < b then b > a', () => {
    fc.assert(
      fc.property(arbHLC, arbHLC, (a, b) => {
        const ab = HLC.compare(a, b);
        const ba = HLC.compare(b, a);
        if (ab === 0) return ba === 0;
        return (ab < 0 && ba > 0) || (ab > 0 && ba < 0);
      }),
    );
  });

  test('compare is reflexive: compare(a, a) === 0', () => {
    fc.assert(fc.property(arbHLC, (a) => HLC.compare(a, a) === 0));
  });

  test('successive increments produce strictly increasing clocks', () => {
    fc.assert(
      fc.property(arbHLC, fc.integer({ min: 0, max: 2_000_000_000 }), (hlc, now) => {
        const a = HLC.increment(hlc, now);
        const b = HLC.increment(a, now);
        return HLC.compare(a, b) < 0;
      }),
    );
  });
});
