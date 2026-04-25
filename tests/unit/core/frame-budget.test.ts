/**
 * FrameBudget -- rAF priority lanes for frame budget management.
 *
 * Property: critical tasks always run regardless of budget.
 * Property: remaining() is always >= 0.
 */

import { describe, test, expect } from 'vitest';
import { Effect } from 'effect';
import { FrameBudget } from '@czap/core';
import { runScopedAsync as runScoped } from '../../helpers/effect-test.js';

// ---------------------------------------------------------------------------
// Basic operations
// ---------------------------------------------------------------------------

describe('FrameBudget', () => {
  test('make creates a frame budget', async () => {
    const budget = await runScoped(FrameBudget.make());
    expect(budget).toBeDefined();
    expect(budget.remaining).toBeDefined();
    expect(budget.canRun).toBeDefined();
    expect(budget.schedule).toBeDefined();
  });

  test('remaining() returns non-negative value', async () => {
    const budget = await runScoped(FrameBudget.make());
    expect(budget.remaining()).toBeGreaterThanOrEqual(0);
  });

  test('default targetFps is 60 (~16.67ms budget)', async () => {
    const budget = await runScoped(FrameBudget.make());
    // remaining() at start should be close to 16.67ms
    expect(budget.remaining()).toBeLessThanOrEqual(16.67);
  });

  test('custom targetFps adjusts budget', async () => {
    const budget = await runScoped(FrameBudget.make({ targetFps: 30 }));
    // 1000/30 = ~33.33ms budget
    expect(budget.remaining()).toBeLessThanOrEqual(33.34);
  });

  test('canRun(critical) always true', async () => {
    const budget = await runScoped(FrameBudget.make());
    expect(budget.canRun('critical')).toBe(true);
  });

  test('schedule runs critical task even with no budget', async () => {
    const budget = await runScoped(FrameBudget.make());
    const result = await Effect.runPromise(budget.schedule('critical', Effect.succeed(42)));
    expect(result).toBe(42);
  });

  test('schedule returns null for low-priority task with no budget', async () => {
    // This is hard to guarantee deterministically without controlling time,
    // but with a tiny fps (e.g. 10000) the budget is ~0.1ms which may already be spent
    const budget = await runScoped(FrameBudget.make({ targetFps: 100000 }));

    // Burn CPU to exhaust the budget
    const start = performance.now();
    while (performance.now() - start < 1) {
      /* spin */
    }

    const result = await Effect.runPromise(budget.schedule('idle', Effect.succeed(42)));

    // With targetFps=100000 the frame budget is ~0.01ms; after burning 1ms of CPU
    // the budget is exhausted, so an 'idle' task should be skipped.
    expect(result).toBeNull();
  });

  test('fps returns an effect that resolves to a number', async () => {
    const budget = await runScoped(FrameBudget.make());
    const fps = await Effect.runPromise(budget.fps);
    expect(typeof fps).toBe('number');
    expect(fps).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Priority thresholds
// ---------------------------------------------------------------------------

describe('FrameBudget priority thresholds', () => {
  test('high needs >= 2ms remaining', async () => {
    const budget = await runScoped(FrameBudget.make({ targetFps: 60 }));
    // At frame start the full 16.67ms budget should be available
    expect(budget.remaining()).toBeGreaterThanOrEqual(2);
    expect(budget.canRun('high')).toBe(true);
  });

  test('low needs >= 6ms remaining', async () => {
    const budget = await runScoped(FrameBudget.make({ targetFps: 60 }));
    expect(budget.remaining()).toBeGreaterThanOrEqual(6);
    expect(budget.canRun('low')).toBe(true);
  });

  test('idle needs >= 12ms remaining', async () => {
    const budget = await runScoped(FrameBudget.make({ targetFps: 60 }));
    expect(budget.remaining()).toBeGreaterThanOrEqual(12);
    expect(budget.canRun('idle')).toBe(true);
  });

  test('rejects targetFps of zero', () => {
    expect(() => FrameBudget.make({ targetFps: 0 })).toThrow(RangeError);
  });

  test('rejects negative targetFps', () => {
    expect(() => FrameBudget.make({ targetFps: -1 })).toThrow(RangeError);
  });

  test('rejects Infinity targetFps', () => {
    expect(() => FrameBudget.make({ targetFps: Infinity })).toThrow(RangeError);
  });
});
