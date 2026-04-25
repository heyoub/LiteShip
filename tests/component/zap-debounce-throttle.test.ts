/**
 * Component test: Zap.debounce and Zap.throttle.
 *
 * Uses real (small) delays for debounce since it relies on Effect.sleep,
 * and small delays for throttle as well to keep tests deterministic.
 * Collects values via a mutable array + Stream.runForEach to avoid
 * scope-closure issues with Fiber.join + Stream.runCollect.
 */

import { describe, test, expect } from 'vitest';
import { Effect, Stream } from 'effect';
import { Zap, Millis } from '@czap/core';
import { runScopedAsync as runScoped } from '../helpers/effect-test.js';

// ---------------------------------------------------------------------------
// Zap.throttle
// ---------------------------------------------------------------------------

describe('Zap.throttle', () => {
  test('creates a throttled Zap with correct tag', async () => {
    const tag = await runScoped(
      Effect.gen(function* () {
        const source = yield* Zap.make<number>();
        const throttled = yield* Zap.throttle(source, Millis(100));
        return throttled._tag;
      }),
    );
    expect(tag).toBe('Zap');
  });

  test('first emission passes through, subsequent within window are dropped', async () => {
    const collected: number[] = [];

    await runScoped(
      Effect.gen(function* () {
        const source = yield* Zap.make<number>();
        const throttled = yield* Zap.throttle(source, Millis(500));

        // Fork a consumer that collects values
        yield* Effect.forkScoped(
          Stream.runForEach(throttled.stream, (v) =>
            Effect.sync(() => {
              collected.push(v);
            }),
          ),
        );

        // Let the consumer subscribe
        yield* Effect.sleep('20 millis');

        // Emit three values rapidly — only first should pass (500ms window)
        yield* source.emit(1);
        yield* source.emit(2);
        yield* source.emit(3);

        // Let the forked fiber process
        yield* Effect.sleep('20 millis');
      }),
    );

    expect(collected).toEqual([1]);
  });
});

// ---------------------------------------------------------------------------
// Zap.debounce
// ---------------------------------------------------------------------------

describe('Zap.debounce', () => {
  test('creates a debounced Zap with correct tag', async () => {
    const tag = await runScoped(
      Effect.gen(function* () {
        const source = yield* Zap.make<number>();
        const debounced = yield* Zap.debounce(source, Millis(10));
        return debounced._tag;
      }),
    );
    expect(tag).toBe('Zap');
  });

  test('emits last value after delay', async () => {
    const collected: number[] = [];

    await runScoped(
      Effect.gen(function* () {
        const source = yield* Zap.make<number>();
        const debounced = yield* Zap.debounce(source, Millis(30));

        yield* Effect.forkScoped(
          Stream.runForEach(debounced.stream, (v) =>
            Effect.sync(() => {
              collected.push(v);
            }),
          ),
        );

        yield* Effect.sleep('20 millis');

        yield* source.emit(99);

        // Wait for debounce delay to elapse
        yield* Effect.sleep('60 millis');
      }),
    );

    expect(collected).toEqual([99]);
  });

  test('cancels pending fiber on rapid re-emission', async () => {
    const collected: number[] = [];

    await runScoped(
      Effect.gen(function* () {
        const source = yield* Zap.make<number>();
        const debounced = yield* Zap.debounce(source, Millis(50));

        yield* Effect.forkScoped(
          Stream.runForEach(debounced.stream, (v) =>
            Effect.sync(() => {
              collected.push(v);
            }),
          ),
        );

        yield* Effect.sleep('20 millis');

        // Emit first value, wait a bit, then override with second
        yield* source.emit(1);
        yield* Effect.sleep('15 millis');
        yield* source.emit(2); // should cancel the pending "1"

        // Wait for debounce of "2" to complete
        yield* Effect.sleep('80 millis');
      }),
    );

    // Only the final value survives the debounce
    expect(collected).toEqual([2]);
  });
});
