/**
 * Property test: VectorClock algebraic laws.
 *
 * Merge is commutative, associative, and idempotent.
 * Tick is monotonic.
 */

import { describe, test, expect } from 'vitest';
import fc from 'fast-check';
import { VectorClock } from '@czap/core';

// ---------------------------------------------------------------------------
// Arbitrary: vector clock from a small set of peer IDs
// ---------------------------------------------------------------------------

const arbPeerId = fc.constantFrom('a', 'b', 'c', 'd');

const arbVectorClock = fc
  .array(fc.tuple(arbPeerId, fc.integer({ min: 0, max: 100 })), { minLength: 0, maxLength: 4 })
  .map((entries) => {
    const obj: Record<string, number> = {};
    for (const [k, v] of entries) obj[k] = v;
    return VectorClock.from(obj);
  });

describe('VectorClock properties', () => {
  test('merge is commutative: merge(a, b) === merge(b, a)', () => {
    fc.assert(
      fc.property(arbVectorClock, arbVectorClock, (a, b) => {
        const ab = VectorClock.merge(a, b);
        const ba = VectorClock.merge(b, a);
        return VectorClock.equals(ab, ba);
      }),
    );
  });

  test('merge is associative: merge(merge(a, b), c) === merge(a, merge(b, c))', () => {
    fc.assert(
      fc.property(arbVectorClock, arbVectorClock, arbVectorClock, (a, b, c) => {
        const ab_c = VectorClock.merge(VectorClock.merge(a, b), c);
        const a_bc = VectorClock.merge(a, VectorClock.merge(b, c));
        return VectorClock.equals(ab_c, a_bc);
      }),
    );
  });

  test('merge is idempotent: merge(a, a) === a', () => {
    fc.assert(
      fc.property(arbVectorClock, (a) => {
        const merged = VectorClock.merge(a, a);
        return VectorClock.equals(merged, a);
      }),
    );
  });

  test('tick is monotonic: tick(a, p) happensBefore is never reversed', () => {
    fc.assert(
      fc.property(arbVectorClock, arbPeerId, (vc, peerId) => {
        const ticked = VectorClock.tick(vc, peerId);
        // The ticked version should "happen after" the original (or not be before it)
        // More precisely: original happensBefore ticked should be true
        return VectorClock.happensBefore(vc, ticked);
      }),
    );
  });

  test('tick increments the peer counter by exactly 1', () => {
    fc.assert(
      fc.property(arbVectorClock, arbPeerId, (vc, peerId) => {
        const before = VectorClock.get(vc, peerId);
        const ticked = VectorClock.tick(vc, peerId);
        const after = VectorClock.get(ticked, peerId);
        return after === before + 1;
      }),
    );
  });

  test('merge preserves max: merge(a, b) >= max(a[p], b[p]) for all peers', () => {
    fc.assert(
      fc.property(arbVectorClock, arbVectorClock, arbPeerId, (a, b, p) => {
        const merged = VectorClock.merge(a, b);
        const mergedVal = VectorClock.get(merged, p);
        const maxVal = Math.max(VectorClock.get(a, p), VectorClock.get(b, p));
        return mergedVal >= maxVal;
      }),
    );
  });

  test('empty clock has 0 for all peers', () => {
    fc.assert(
      fc.property(arbPeerId, (peerId) => {
        const empty = VectorClock.make();
        return VectorClock.get(empty, peerId) === 0;
      }),
    );
  });
});
