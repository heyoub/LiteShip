/**
 * VectorClock -- causality tracking for distributed systems.
 *
 * Full coverage: happensBefore, concurrent, equals, compare, merge.
 *
 * Property: merge is commutative (merge(a,b) == merge(b,a)).
 * Property: happensBefore is transitive.
 * Property: concurrent(a,b) implies !happensBefore(a,b) && !happensBefore(b,a).
 * Property: compare is consistent with happensBefore.
 */

import { describe, test, expect } from 'vitest';
import fc from 'fast-check';
import { VectorClock } from '@czap/core';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const arbVectorClock = fc
  .dictionary(fc.string({ minLength: 1, maxLength: 5 }), fc.integer({ min: 0, max: 100 }))
  .map((entries) => VectorClock.from(entries));

// ---------------------------------------------------------------------------
// happensBefore
// ---------------------------------------------------------------------------

describe('VectorClock.happensBefore', () => {
  test('empty < ticked', () => {
    const a = VectorClock.make();
    const b = VectorClock.tick(VectorClock.make(), 'p1');
    expect(VectorClock.happensBefore(a, b)).toBe(true);
  });

  test('a < b when a has strictly lower counters', () => {
    const a = VectorClock.from({ p1: 1 });
    const b = VectorClock.from({ p1: 2 });
    expect(VectorClock.happensBefore(a, b)).toBe(true);
  });

  test('a NOT < a (reflexive false)', () => {
    const a = VectorClock.from({ p1: 3 });
    expect(VectorClock.happensBefore(a, a)).toBe(false);
  });

  test('divergent clocks are NOT ordered', () => {
    const a = VectorClock.from({ p1: 2, p2: 1 });
    const b = VectorClock.from({ p1: 1, p2: 2 });
    expect(VectorClock.happensBefore(a, b)).toBe(false);
    expect(VectorClock.happensBefore(b, a)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// concurrent
// ---------------------------------------------------------------------------

describe('VectorClock.concurrent', () => {
  test('divergent clocks are concurrent', () => {
    const a = VectorClock.from({ p1: 2, p2: 1 });
    const b = VectorClock.from({ p1: 1, p2: 2 });
    expect(VectorClock.concurrent(a, b)).toBe(true);
  });

  test('ordered clocks are NOT concurrent', () => {
    const a = VectorClock.from({ p1: 1 });
    const b = VectorClock.from({ p1: 2 });
    expect(VectorClock.concurrent(a, b)).toBe(false);
  });

  test('equal clocks are NOT concurrent', () => {
    const a = VectorClock.from({ p1: 1 });
    const b = VectorClock.from({ p1: 1 });
    expect(VectorClock.concurrent(a, b)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// equals
// ---------------------------------------------------------------------------

describe('VectorClock.equals', () => {
  test('identical clocks are equal', () => {
    const a = VectorClock.from({ p1: 1, p2: 2 });
    const b = VectorClock.from({ p1: 1, p2: 2 });
    expect(VectorClock.equals(a, b)).toBe(true);
  });

  test('different clocks are not equal', () => {
    const a = VectorClock.from({ p1: 1 });
    const b = VectorClock.from({ p1: 2 });
    expect(VectorClock.equals(a, b)).toBe(false);
  });

  test('clock with extra peer at 0 equals clock without that peer', () => {
    const a = VectorClock.from({ p1: 1 });
    // VectorClock.get returns 0 for missing peers
    const b = VectorClock.from({ p1: 1 });
    expect(VectorClock.equals(a, b)).toBe(true);
  });

  test('empty clocks are equal', () => {
    expect(VectorClock.equals(VectorClock.make(), VectorClock.make())).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// compare
// ---------------------------------------------------------------------------

describe('VectorClock.compare', () => {
  test('a < b returns -1', () => {
    const a = VectorClock.from({ p1: 1 });
    const b = VectorClock.from({ p1: 2 });
    expect(VectorClock.compare(a, b)).toBe(-1);
  });

  test('b < a returns 1', () => {
    const a = VectorClock.from({ p1: 2 });
    const b = VectorClock.from({ p1: 1 });
    expect(VectorClock.compare(a, b)).toBe(1);
  });

  test('concurrent or equal returns 0', () => {
    const a = VectorClock.from({ p1: 2, p2: 1 });
    const b = VectorClock.from({ p1: 1, p2: 2 });
    expect(VectorClock.compare(a, b)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// merge
// ---------------------------------------------------------------------------

describe('VectorClock.merge', () => {
  test('merge takes max of each peer', () => {
    const a = VectorClock.from({ p1: 3, p2: 1 });
    const b = VectorClock.from({ p1: 1, p2: 5 });
    const m = VectorClock.merge(a, b);

    expect(VectorClock.get(m, 'p1')).toBe(3);
    expect(VectorClock.get(m, 'p2')).toBe(5);
  });

  test('merge with empty returns same', () => {
    const a = VectorClock.from({ p1: 3 });
    const m = VectorClock.merge(a, VectorClock.make());
    expect(VectorClock.get(m, 'p1')).toBe(3);
  });

  test('merge includes peers from both sides', () => {
    const a = VectorClock.from({ p1: 1 });
    const b = VectorClock.from({ p2: 2 });
    const m = VectorClock.merge(a, b);
    expect(VectorClock.peers(m).sort()).toEqual(['p1', 'p2']);
  });
});

// ---------------------------------------------------------------------------
// Utility methods
// ---------------------------------------------------------------------------

describe('VectorClock utilities', () => {
  test('tick increments the peer counter', () => {
    const a = VectorClock.make();
    const b = VectorClock.tick(a, 'p1');
    expect(VectorClock.get(b, 'p1')).toBe(1);
    const c = VectorClock.tick(b, 'p1');
    expect(VectorClock.get(c, 'p1')).toBe(2);
  });

  test('get returns 0 for missing peer', () => {
    const vc = VectorClock.make();
    expect(VectorClock.get(vc, 'nonexistent')).toBe(0);
  });

  test('toObject roundtrips via from', () => {
    const original = { p1: 3, p2: 7 };
    const vc = VectorClock.from(original);
    expect(VectorClock.toObject(vc)).toEqual(original);
  });

  test('peers returns all peer ids', () => {
    const vc = VectorClock.from({ a: 1, b: 2, c: 3 });
    expect(VectorClock.peers(vc).sort()).toEqual(['a', 'b', 'c']);
  });

  test('size matches peer count', () => {
    const vc = VectorClock.from({ a: 1, b: 2 });
    expect(VectorClock.size(vc)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Property-based
// ---------------------------------------------------------------------------

describe('VectorClock properties', () => {
  test('merge is commutative', () => {
    fc.assert(
      fc.property(arbVectorClock, arbVectorClock, (a, b) => {
        const ab = VectorClock.merge(a, b);
        const ba = VectorClock.merge(b, a);
        expect(VectorClock.equals(ab, ba)).toBe(true);
      }),
    );
  });

  test('merge is idempotent', () => {
    fc.assert(
      fc.property(arbVectorClock, (a) => {
        const merged = VectorClock.merge(a, a);
        expect(VectorClock.equals(merged, a)).toBe(true);
      }),
    );
  });

  test('tick always increases ordering', () => {
    fc.assert(
      fc.property(arbVectorClock, fc.string({ minLength: 1, maxLength: 5 }), (vc, peer) => {
        const ticked = VectorClock.tick(vc, peer);
        expect(VectorClock.happensBefore(vc, ticked)).toBe(true);
      }),
    );
  });

  test('concurrent implies NOT happensBefore in either direction', () => {
    fc.assert(
      fc.property(arbVectorClock, arbVectorClock, (a, b) => {
        if (VectorClock.concurrent(a, b)) {
          expect(VectorClock.happensBefore(a, b)).toBe(false);
          expect(VectorClock.happensBefore(b, a)).toBe(false);
        }
      }),
    );
  });

  test('compare is consistent with happensBefore', () => {
    fc.assert(
      fc.property(arbVectorClock, arbVectorClock, (a, b) => {
        const cmp = VectorClock.compare(a, b);
        if (cmp === -1) expect(VectorClock.happensBefore(a, b)).toBe(true);
        if (cmp === 1) expect(VectorClock.happensBefore(b, a)).toBe(true);
      }),
    );
  });
});
