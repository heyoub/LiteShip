/**
 * Core package smoke test -- verify nothing is fundamentally broken.
 *
 * Each assertion should complete in < 100ms. If any of these fail,
 * something catastrophic has happened to the package exports.
 */

import { describe, test, expect } from 'vitest';
import { Effect, Scope } from 'effect';
import { Boundary, Compositor, ContentAddress, Cell, VectorClock, HLC, Plan, Millis } from '@czap/core';

describe('core smoke', () => {
  test('Boundary.make + evaluate', () => {
    const b = Boundary.make({
      input: 'x',
      at: [
        [0, 'low'],
        [100, 'high'],
      ] as const,
    });
    expect(Boundary.evaluate(b, 50)).toBe('low');
    expect(Boundary.evaluate(b, 150)).toBe('high');
  });

  test('ContentAddress branding', () => {
    const addr = ContentAddress('fnv1a:12345678');
    expect(typeof addr).toBe('string');
    expect(addr).toBe('fnv1a:12345678');
  });

  test('Compositor.create resolves', async () => {
    const compositor = await Effect.runPromise(Effect.scoped(Compositor.create()));
    expect(compositor).toBeDefined();
  });

  test('Cell.make and get', async () => {
    const cell = await Effect.runPromise(Cell.make(42));
    const val = await Effect.runPromise(cell.get);
    expect(val).toBe(42);
  });

  test('VectorClock round-trip', () => {
    const vc = VectorClock.from({ a: 1, b: 2 });
    expect(VectorClock.toObject(vc)).toEqual({ a: 1, b: 2 });
  });

  test('HLC.create produces clock', async () => {
    const t = await Effect.runPromise(
      Effect.gen(function* () {
        const clock = yield* HLC.makeClock('smoke-node');
        return yield* HLC.tick(clock);
      }),
    );
    expect(t.wall_ms).toBeGreaterThan(0);
  });

  test('Plan.make creates plan', () => {
    const plan = Plan.make();
    expect(plan).toBeDefined();
  });

  test('Millis brand preserves numeric value', () => {
    expect(Millis(100) + 0).toBe(100);
  });
});
