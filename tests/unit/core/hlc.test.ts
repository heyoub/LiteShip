/**
 * HLC -- Hybrid Logical Clock creation, comparison, merge, encoding, and overflow.
 */

import { describe, test, expect, vi, afterEach } from 'vitest';
import { Effect } from 'effect';
import { HLC } from '@czap/core';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('HLC', () => {
  describe('creation', () => {
    test('create initializes with zero wall_ms and counter', () => {
      const hlc = HLC.create('node-a');
      expect(hlc.wall_ms).toBe(0);
      expect(hlc.counter).toBe(0);
      expect(hlc.node_id).toBe('node-a');
    });
  });

  describe('comparison', () => {
    test('lower wall_ms compares less', () => {
      const a = HLC.increment(HLC.create('node-a'), 1000);
      const b = HLC.increment(HLC.create('node-a'), 2000);
      expect(HLC.compare(a, b)).toBe(-1);
      expect(HLC.compare(b, a)).toBe(1);
    });

    test('same wall_ms, lower counter compares less', () => {
      const a = HLC.increment(HLC.create('node-a'), 1000);
      const b = HLC.increment(a, 1000);
      expect(a.wall_ms).toBe(b.wall_ms);
      expect(a.counter).toBeLessThan(b.counter);
      expect(HLC.compare(a, b)).toBe(-1);
    });

    test('same wall_ms, higher counter compares greater', () => {
      const a: HLC.Shape = { wall_ms: 1000, counter: 3, node_id: 'node-a' };
      const b: HLC.Shape = { wall_ms: 1000, counter: 1, node_id: 'node-a' };
      expect(HLC.compare(a, b)).toBe(1);
    });

    test('same wall_ms and counter, node_id breaks tie', () => {
      const a: HLC.Shape = { wall_ms: 1000, counter: 0, node_id: 'aaa' };
      const b: HLC.Shape = { wall_ms: 1000, counter: 0, node_id: 'zzz' };
      expect(HLC.compare(a, b)).toBe(-1);
      expect(HLC.compare(b, a)).toBe(1);
    });

    test('identical HLCs compare equal', () => {
      const a: HLC.Shape = { wall_ms: 1000, counter: 5, node_id: 'node-a' };
      const b: HLC.Shape = { wall_ms: 1000, counter: 5, node_id: 'node-a' };
      expect(HLC.compare(a, b)).toBe(0);
    });
  });

  describe('increment', () => {
    test('increment with newer wall time resets counter', () => {
      const hlc = HLC.increment(HLC.create('node-a'), 1000);
      expect(hlc.wall_ms).toBe(1000);
      expect(hlc.counter).toBe(0);

      const next = HLC.increment(hlc, 2000);
      expect(next.wall_ms).toBe(2000);
      expect(next.counter).toBe(0);
    });

    test('increment with same wall time increments counter', () => {
      const hlc = HLC.increment(HLC.create('node-a'), 1000);
      const next = HLC.increment(hlc, 1000);
      expect(next.wall_ms).toBe(1000);
      expect(next.counter).toBe(1);
    });

    test('increment with older wall time keeps local wall_ms and increments counter', () => {
      const hlc = HLC.increment(HLC.create('node-a'), 2000);
      const next = HLC.increment(hlc, 1000);
      expect(next.wall_ms).toBe(2000);
      expect(next.counter).toBe(1);
    });

    test('monotonic ordering: repeated increments always advance', () => {
      let hlc = HLC.create('node-a');
      for (let i = 0; i < 100; i++) {
        const next = HLC.increment(hlc, 1000);
        expect(HLC.compare(hlc, next)).toBe(-1);
        hlc = next;
      }
    });
  });

  describe('merge', () => {
    test('merge takes max of wall_ms values', () => {
      const local: HLC.Shape = { wall_ms: 1000, counter: 3, node_id: 'node-a' };
      const remote: HLC.Shape = { wall_ms: 2000, counter: 5, node_id: 'node-b' };
      const merged = HLC.merge(local, remote, 500);
      expect(merged.wall_ms).toBe(2000);
    });

    test('merge with same wall_ms takes max counter + 1', () => {
      const local: HLC.Shape = { wall_ms: 1000, counter: 3, node_id: 'node-a' };
      const remote: HLC.Shape = { wall_ms: 1000, counter: 7, node_id: 'node-b' };
      const merged = HLC.merge(local, remote, 1000);
      expect(merged.wall_ms).toBe(1000);
      expect(merged.counter).toBe(8);
    });

    test('merge preserves local node_id', () => {
      const local = HLC.create('node-a');
      const remote: HLC.Shape = { wall_ms: 5000, counter: 0, node_id: 'node-b' };
      const merged = HLC.merge(local, remote, 3000);
      expect(merged.node_id).toBe('node-a');
    });

    test('merge with now > both resets counter', () => {
      const local: HLC.Shape = { wall_ms: 1000, counter: 5, node_id: 'node-a' };
      const remote: HLC.Shape = { wall_ms: 2000, counter: 3, node_id: 'node-b' };
      const merged = HLC.merge(local, remote, 5000);
      expect(merged.wall_ms).toBe(5000);
      expect(merged.counter).toBe(0);
    });

    test('merge where local wall_ms wins increments local counter', () => {
      const local: HLC.Shape = { wall_ms: 3000, counter: 5, node_id: 'node-a' };
      const remote: HLC.Shape = { wall_ms: 1000, counter: 10, node_id: 'node-b' };
      const merged = HLC.merge(local, remote, 2000);
      expect(merged.wall_ms).toBe(3000);
      expect(merged.counter).toBe(6);
    });

    test('merge where remote wall_ms wins increments remote counter', () => {
      const local: HLC.Shape = { wall_ms: 1000, counter: 2, node_id: 'node-a' };
      const remote: HLC.Shape = { wall_ms: 3000, counter: 7, node_id: 'node-b' };
      const merged = HLC.merge(local, remote, 2000);
      expect(merged.wall_ms).toBe(3000);
      expect(merged.counter).toBe(8);
      expect(merged.node_id).toBe('node-a');
    });
  });

  describe('counter overflow', () => {
    test('increment throws at 0xFFFF overflow', () => {
      const hlc: HLC.Shape = { wall_ms: 1000, counter: 0xffff, node_id: 'node-a' };
      expect(() => HLC.increment(hlc, 1000)).toThrow('counter overflow');
    });

    test('merge throws at 0xFFFF overflow', () => {
      const local: HLC.Shape = { wall_ms: 1000, counter: 0xffff, node_id: 'node-a' };
      const remote: HLC.Shape = { wall_ms: 1000, counter: 0xffff, node_id: 'node-b' };
      expect(() => HLC.merge(local, remote, 1000)).toThrow('counter overflow');
    });

    test('increment past overflow wall_ms resets counter to 0', () => {
      const hlc: HLC.Shape = { wall_ms: 1000, counter: 0xffff, node_id: 'node-a' };
      const next = HLC.increment(hlc, 2000);
      expect(next.wall_ms).toBe(2000);
      expect(next.counter).toBe(0);
    });
  });

  describe('encode / decode', () => {
    test('roundtrip preserves all fields', () => {
      const original: HLC.Shape = { wall_ms: 123456789, counter: 42, node_id: 'node-xyz' };
      const encoded = HLC.encode(original);
      const decoded = HLC.decode(encoded);
      expect(decoded).toEqual(original);
    });

    test('encode produces colon-separated hex string', () => {
      const hlc: HLC.Shape = { wall_ms: 255, counter: 1, node_id: 'n' };
      const encoded = HLC.encode(hlc);
      expect(encoded).toContain(':');
      const parts = encoded.split(':');
      expect(parts.length).toBeGreaterThanOrEqual(3);
    });

    test('decode throws on invalid format', () => {
      expect(() => HLC.decode('invalid')).toThrow('Invalid HLC format');
    });

    test('decode throws on invalid wall_ms hex', () => {
      expect(() => HLC.decode('nothex:0001:node-a')).toThrow(/wall_ms is not valid hex/);
    });

    test('decode throws on invalid counter hex', () => {
      expect(() => HLC.decode('0000000003e8:nothex:node-a')).toThrow(/counter is not valid hex/);
    });

    test('node_id with colons roundtrips correctly', () => {
      const original: HLC.Shape = { wall_ms: 1000, counter: 0, node_id: 'host:port:id' };
      const decoded = HLC.decode(HLC.encode(original));
      expect(decoded.node_id).toBe('host:port:id');
    });
  });

  describe('managed clock', () => {
    test('tick advances the managed clock using Date.now', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(1234);
      const clock = await Effect.runPromise(HLC.makeClock('node-a'));
      const timestamp = await Effect.runPromise(HLC.tick(clock));

      expect(timestamp).toEqual({ wall_ms: 1234, counter: 0, node_id: 'node-a' });
    });

    test('receive merges remote timestamps into the managed clock', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(1500);
      const clock = await Effect.runPromise(HLC.makeClock('node-a'));
      const timestamp = await Effect.runPromise(HLC.receive(clock, { wall_ms: 2000, counter: 3, node_id: 'node-b' }));

      expect(timestamp).toEqual({ wall_ms: 2000, counter: 4, node_id: 'node-a' });
    });
  });
});
