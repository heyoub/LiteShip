/**
 * Cap -- capability lattice: superset, atLeast, union, intersection, ordinal.
 */

import { describe, test, expect } from 'vitest';
import { Cap } from '@czap/core';
import type { CapLevel } from '@czap/core';

describe('Cap', () => {
  describe('construction', () => {
    test('empty creates CapSet with no levels', () => {
      const caps = Cap.empty();
      expect(caps._tag).toBe('CapSet');
      expect(caps.levels.size).toBe(0);
    });

    test('from creates CapSet with specified levels', () => {
      const caps = Cap.from(['static', 'reactive']);
      expect(caps.levels.has('static')).toBe(true);
      expect(caps.levels.has('reactive')).toBe(true);
      expect(caps.levels.has('gpu')).toBe(false);
    });

    test('grant adds a level', () => {
      const caps = Cap.grant(Cap.empty(), 'animated');
      expect(Cap.has(caps, 'animated')).toBe(true);
    });

    test('revoke removes a level', () => {
      const caps = Cap.from(['static', 'styled', 'reactive']);
      const revoked = Cap.revoke(caps, 'styled');
      expect(Cap.has(revoked, 'styled')).toBe(false);
      expect(Cap.has(revoked, 'static')).toBe(true);
      expect(Cap.has(revoked, 'reactive')).toBe(true);
    });

    test('has checks level membership', () => {
      const caps = Cap.from(['gpu']);
      expect(Cap.has(caps, 'gpu')).toBe(true);
      expect(Cap.has(caps, 'static')).toBe(false);
    });
  });

  describe('superset', () => {
    test('superset returns true when a contains all of b', () => {
      const a = Cap.from(['static', 'styled', 'reactive', 'animated', 'gpu']);
      const b = Cap.from(['styled', 'reactive']);
      expect(Cap.superset(a, b)).toBe(true);
    });

    test('superset returns false when a is missing levels from b', () => {
      const a = Cap.from(['static', 'styled']);
      const b = Cap.from(['styled', 'gpu']);
      expect(Cap.superset(a, b)).toBe(false);
    });

    test('superset of itself is true', () => {
      const caps = Cap.from(['reactive', 'animated']);
      expect(Cap.superset(caps, caps)).toBe(true);
    });

    test('everything is superset of empty', () => {
      const caps = Cap.from(['static']);
      expect(Cap.superset(caps, Cap.empty())).toBe(true);
    });

    test('empty is not superset of non-empty', () => {
      expect(Cap.superset(Cap.empty(), Cap.from(['static']))).toBe(false);
    });
  });

  describe('atLeast', () => {
    const levels: CapLevel[] = ['static', 'styled', 'reactive', 'animated', 'gpu'];

    test('atLeast returns true for same level', () => {
      for (const level of levels) {
        expect(Cap.atLeast(level, level)).toBe(true);
      }
    });

    test('higher level is atLeast lower level', () => {
      expect(Cap.atLeast('gpu', 'static')).toBe(true);
      expect(Cap.atLeast('animated', 'styled')).toBe(true);
      expect(Cap.atLeast('reactive', 'static')).toBe(true);
    });

    test('lower level is NOT atLeast higher level', () => {
      expect(Cap.atLeast('static', 'gpu')).toBe(false);
      expect(Cap.atLeast('styled', 'animated')).toBe(false);
      expect(Cap.atLeast('reactive', 'gpu')).toBe(false);
    });

    test('atLeast respects full ordering', () => {
      for (let i = 0; i < levels.length; i++) {
        for (let j = 0; j < levels.length; j++) {
          expect(Cap.atLeast(levels[i]!, levels[j]!)).toBe(i >= j);
        }
      }
    });
  });

  describe('union', () => {
    test('union combines all levels from both sets', () => {
      const a = Cap.from(['static', 'styled']);
      const b = Cap.from(['reactive', 'animated']);
      const u = Cap.union(a, b);
      expect(u.levels.size).toBe(4);
      expect(Cap.has(u, 'static')).toBe(true);
      expect(Cap.has(u, 'styled')).toBe(true);
      expect(Cap.has(u, 'reactive')).toBe(true);
      expect(Cap.has(u, 'animated')).toBe(true);
    });

    test('union with empty returns same set', () => {
      const caps = Cap.from(['gpu', 'reactive']);
      const u = Cap.union(caps, Cap.empty());
      expect(u.levels.size).toBe(2);
    });

    test('union with self is idempotent', () => {
      const caps = Cap.from(['static', 'animated']);
      const u = Cap.union(caps, caps);
      expect(u.levels.size).toBe(2);
    });

    test('union deduplicates overlapping levels', () => {
      const a = Cap.from(['static', 'styled', 'reactive']);
      const b = Cap.from(['styled', 'reactive', 'gpu']);
      const u = Cap.union(a, b);
      expect(u.levels.size).toBe(4);
    });
  });

  describe('intersection', () => {
    test('intersection returns only shared levels', () => {
      const a = Cap.from(['static', 'styled', 'reactive']);
      const b = Cap.from(['styled', 'reactive', 'gpu']);
      const i = Cap.intersection(a, b);
      expect(i.levels.size).toBe(2);
      expect(Cap.has(i, 'styled')).toBe(true);
      expect(Cap.has(i, 'reactive')).toBe(true);
      expect(Cap.has(i, 'static')).toBe(false);
      expect(Cap.has(i, 'gpu')).toBe(false);
    });

    test('intersection with empty is empty', () => {
      const caps = Cap.from(['static', 'gpu']);
      const i = Cap.intersection(caps, Cap.empty());
      expect(i.levels.size).toBe(0);
    });

    test('intersection with self returns same set', () => {
      const caps = Cap.from(['reactive', 'animated']);
      const i = Cap.intersection(caps, caps);
      expect(i.levels.size).toBe(2);
    });

    test('intersection of disjoint sets is empty', () => {
      const a = Cap.from(['static', 'styled']);
      const b = Cap.from(['animated', 'gpu']);
      const i = Cap.intersection(a, b);
      expect(i.levels.size).toBe(0);
    });
  });

  describe('ordinal', () => {
    test('ordinal returns increasing values for ascending levels', () => {
      expect(Cap.ordinal('static')).toBeLessThan(Cap.ordinal('styled'));
      expect(Cap.ordinal('styled')).toBeLessThan(Cap.ordinal('reactive'));
      expect(Cap.ordinal('reactive')).toBeLessThan(Cap.ordinal('animated'));
      expect(Cap.ordinal('animated')).toBeLessThan(Cap.ordinal('gpu'));
    });

    test('ordinal values are non-negative integers', () => {
      const levels: CapLevel[] = ['static', 'styled', 'reactive', 'animated', 'gpu'];
      for (const level of levels) {
        const ord = Cap.ordinal(level);
        expect(ord).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(ord)).toBe(true);
      }
    });

    test('ordinal is consistent with atLeast', () => {
      const levels: CapLevel[] = ['static', 'styled', 'reactive', 'animated', 'gpu'];
      for (const a of levels) {
        for (const b of levels) {
          expect(Cap.atLeast(a, b)).toBe(Cap.ordinal(a) >= Cap.ordinal(b));
        }
      }
    });
  });
});
