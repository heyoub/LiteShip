/**
 * Component test: Zap push-based event channels.
 *
 * Tests Zap.make, Zap.fromDOMEvent, merge, map, filter
 * using mock DOM elements and Effect scoped resources.
 */

import { describe, test, expect } from 'vitest';
import { Duration, Effect, Stream } from 'effect';
import { Zap } from '@czap/core';
import type { Millis } from '@czap/core';
import { mockHTMLElement } from '../helpers/mock-dom.js';
import { runScopedAsync as runScoped } from '../helpers/effect-test.js';

// ---------------------------------------------------------------------------
// Zap.make -- basic PubSub channel
// ---------------------------------------------------------------------------

describe('Zap.make', () => {
  test('creates a Zap with correct tag', async () => {
    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const zap = yield* Zap.make<number>();
          return zap._tag;
        }),
      ),
    );
    expect(result).toBe('Zap');
  });

  test('emit does not throw', async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const zap = yield* Zap.make<number>();
          yield* zap.emit(42);
        }),
      ),
    );
  });

  test('stream has correct type', async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const zap = yield* Zap.make<string>();
          expect(zap.stream).toBeDefined();
        }),
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// Zap.fromDOMEvent
// ---------------------------------------------------------------------------

describe('Zap.fromDOMEvent', () => {
  test('registers event listener on element', async () => {
    const el = mockHTMLElement();

    await runScoped(
      Effect.gen(function* () {
        yield* Zap.fromDOMEvent(el as unknown as HTMLElement, 'click');
        // Listener should be registered
        expect(el._listeners.get('click')?.size).toBe(1);
      }),
    );
  });

  test('scope cleanup removes event listener', async () => {
    const el = mockHTMLElement();

    // Run the scoped effect — when it completes, the scope closes
    // and the acquireRelease should clean up the listener
    await runScoped(
      Effect.gen(function* () {
        yield* Zap.fromDOMEvent(el as unknown as HTMLElement, 'click');
        // Listener should be registered inside scope
        expect(el._listeners.get('click')?.size).toBe(1);
      }),
    );

    // After scope closes, listener should be removed
    expect(el._listeners.get('click')?.size ?? 0).toBe(0);
  });

  test('returns a Zap with correct tag', async () => {
    const el = mockHTMLElement();

    const result = await runScoped(
      Effect.gen(function* () {
        const zap = yield* Zap.fromDOMEvent(el as unknown as HTMLElement, 'click');
        return zap._tag;
      }),
    );

    expect(result).toBe('Zap');
  });

  test('emits DOM events through the stream', async () => {
    const el = mockHTMLElement();

    await runScoped(
      Effect.gen(function* () {
        const zap = yield* Zap.fromDOMEvent(el as unknown as HTMLElement, 'click');
        const received: string[] = [];

        yield* Effect.forkScoped(
          Stream.runForEach(zap.stream, (event) =>
            Effect.sync(() => {
              received.push(event.type);
            }),
          ),
        );

        yield* Effect.sleep(Duration.millis(0));
        el._emit('click');
        yield* Effect.sleep(Duration.millis(0));

        expect(received).toEqual(['click']);
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Zap.map
// ---------------------------------------------------------------------------

describe('Zap.map', () => {
  test('creates a mapped Zap', async () => {
    await runScoped(
      Effect.gen(function* () {
        const zap = yield* Zap.make<number>();
        const doubled = yield* Zap.map(zap, (x) => x * 2);
        expect(doubled._tag).toBe('Zap');
      }),
    );
  });

  test('transforms emitted values through the mapped stream', async () => {
    await runScoped(
      Effect.gen(function* () {
        const zap = yield* Zap.make<number>();
        const doubled = yield* Zap.map(zap, (x) => x * 2);
        const received: number[] = [];

        yield* Effect.forkScoped(
          Stream.runForEach(doubled.stream, (value) =>
            Effect.sync(() => {
              received.push(value);
            }),
          ),
        );

        yield* Effect.sleep(Duration.millis(0));
        yield* zap.emit(2);
        yield* Effect.sleep(Duration.millis(0));

        expect(received).toEqual([4]);
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Zap.filter
// ---------------------------------------------------------------------------

describe('Zap.filter', () => {
  test('creates a filtered Zap', async () => {
    await runScoped(
      Effect.gen(function* () {
        const zap = yield* Zap.make<number>();
        const evens = yield* Zap.filter(zap, (x) => x % 2 === 0);
        expect(evens._tag).toBe('Zap');
      }),
    );
  });

  test('drops values that do not satisfy the predicate', async () => {
    await runScoped(
      Effect.gen(function* () {
        const zap = yield* Zap.make<number>();
        const evens = yield* Zap.filter(zap, (x) => x % 2 === 0);
        const received: number[] = [];

        yield* Effect.forkScoped(
          Stream.runForEach(evens.stream, (value) =>
            Effect.sync(() => {
              received.push(value);
            }),
          ),
        );

        yield* Effect.sleep(Duration.millis(0));
        yield* zap.emit(1);
        yield* zap.emit(2);
        yield* zap.emit(3);
        yield* Effect.sleep(Duration.millis(0));

        expect(received).toEqual([2]);
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Zap.merge
// ---------------------------------------------------------------------------

describe('Zap.merge', () => {
  test('creates a merged Zap from multiple channels', async () => {
    await runScoped(
      Effect.gen(function* () {
        const zap1 = yield* Zap.make<string>();
        const zap2 = yield* Zap.make<string>();
        const merged = yield* Zap.merge([zap1, zap2]);
        expect(merged._tag).toBe('Zap');
      }),
    );
  });

  test('forwards events from every merged source', async () => {
    await runScoped(
      Effect.gen(function* () {
        const zap1 = yield* Zap.make<string>();
        const zap2 = yield* Zap.make<string>();
        const merged = yield* Zap.merge([zap1, zap2]);
        const received: string[] = [];

        yield* Effect.forkScoped(
          Stream.runForEach(merged.stream, (value) =>
            Effect.sync(() => {
              received.push(value);
            }),
          ),
        );

        yield* Effect.sleep(Duration.millis(0));
        yield* zap1.emit('left');
        yield* zap2.emit('right');
        yield* Effect.sleep(Duration.millis(0));

        expect(received).toEqual(['left', 'right']);
      }),
    );
  });
});

describe('Zap.debounce', () => {
  test('emits only the latest value after the debounce window', async () => {
    await runScoped(
      Effect.gen(function* () {
        const zap = yield* Zap.make<number>();
        const debounced = yield* Zap.debounce(zap, 30 as Millis);
        const received: number[] = [];
        let resolveEmission: ((value: number) => void) | null = null;
        const emission = new Promise<number>((resolve) => {
          resolveEmission = resolve;
        });

        yield* Effect.forkScoped(
          Stream.runForEach(debounced.stream, (value) =>
            Effect.sync(() => {
              received.push(value);
              resolveEmission?.(value);
              resolveEmission = null;
            }),
          ),
        );

        // Give the subscriber time to attach so this API-surface test does not
        // depend on tight scheduler timing during the full gauntlet lane.
        yield* Effect.sleep(Duration.millis(20));
        yield* zap.emit(1);
        yield* zap.emit(2);
        const latest = yield* Effect.promise(() =>
          Promise.race([
            emission,
            new Promise<number>((_, reject) => {
              setTimeout(() => reject(new Error('debounced emission timed out')), 250);
            }),
          ]),
        );
        expect(latest).toBe(2);
        yield* Effect.sleep(Duration.millis(20));

        expect(received).toEqual([2]);
      }),
    );
  });
});

describe('Zap.throttle', () => {
  test('emits at most one value per throttle window', async () => {
    await runScoped(
      Effect.gen(function* () {
        const zap = yield* Zap.make<number>();
        const throttled = yield* Zap.throttle(zap, 10 as Millis);
        const received: number[] = [];

        yield* Effect.forkScoped(
          Stream.runForEach(throttled.stream, (value) =>
            Effect.sync(() => {
              received.push(value);
            }),
          ),
        );

        yield* Effect.sleep(Duration.millis(0));
        yield* zap.emit(1);
        yield* zap.emit(2);
        yield* Effect.sleep(Duration.millis(15));
        yield* zap.emit(3);
        yield* Effect.sleep(Duration.millis(1));

        expect(received).toEqual([1, 3]);
      }),
    );
  });
});
