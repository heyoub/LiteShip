/**
 * Zap<T> -- push-based event channel via PubSub.
 *
 * @module
 */

import { Effect, Stream, PubSub, Fiber, Duration } from 'effect';
import type { Scope } from 'effect';
import type { Millis } from './brands.js';

interface ZapShape<T> {
  readonly _tag: 'Zap';
  readonly stream: Stream.Stream<T>;
  emit(value: T): Effect.Effect<void>;
}

/**
 * Creates a new push-based event channel backed by an unbounded PubSub.
 *
 * @example
 * ```ts
 * const zap = await Effect.runPromise(Effect.scoped(Zap.make<number>()));
 * Effect.runSync(zap.emit(42));
 * // Subscribers on zap.stream will receive 42
 * ```
 */
const _make = <T>(): Effect.Effect<ZapShape<T>, never, Scope.Scope> =>
  Effect.gen(function* () {
    const pubsub = yield* PubSub.unbounded<T>();

    yield* Effect.addFinalizer(() => PubSub.shutdown(pubsub));

    return {
      _tag: 'Zap' as const,
      stream: Stream.fromPubSub(pubsub),
      emit: (value: T) => PubSub.publish(pubsub, value),
    };
  });

/**
 * Creates a Zap from a DOM event, auto-managing listener lifecycle via Scope.
 *
 * @example
 * ```ts
 * const program = Effect.scoped(Effect.gen(function* () {
 *   const btn = document.getElementById('btn');
 *   if (!(btn instanceof HTMLElement)) return;
 *   const clicks = yield* Zap.fromDOMEvent(btn, 'click');
 *   // clicks.stream emits MouseEvents; listener removed when scope closes
 * }));
 * ```
 */
const _fromDOMEvent = <K extends keyof HTMLElementEventMap>(
  element: HTMLElement,
  event: K,
): Effect.Effect<ZapShape<HTMLElementEventMap[K]>, never, Scope.Scope> =>
  Effect.gen(function* () {
    const zap = yield* _make<HTMLElementEventMap[K]>();

    const listener = (e: HTMLElementEventMap[K]): void => {
      Effect.runSync(zap.emit(e));
    };

    yield* Effect.acquireRelease(
      Effect.sync(() => element.addEventListener(event, listener)),
      () => Effect.sync(() => element.removeEventListener(event, listener)),
    );

    return zap;
  });

/**
 * Merges multiple Zaps of the same type into a single Zap.
 *
 * @example
 * ```ts
 * const program = Effect.scoped(Effect.gen(function* () {
 *   const a = yield* Zap.make<number>();
 *   const b = yield* Zap.make<number>();
 *   const merged = yield* Zap.merge([a, b]);
 *   // merged.stream receives events from both a and b
 * }));
 * ```
 */
const _merge = <T>(events: ReadonlyArray<ZapShape<T>>): Effect.Effect<ZapShape<T>, never, Scope.Scope> =>
  Effect.gen(function* () {
    const merged = yield* _make<T>();

    yield* Effect.forkScoped(
      Effect.all(
        events.map((event) => Stream.runForEach(event.stream, (value) => merged.emit(value))),
        { concurrency: 'unbounded' },
      ),
    );

    return merged;
  });

/**
 * Transforms each value emitted by a Zap through a mapping function.
 *
 * @example
 * ```ts
 * const program = Effect.scoped(Effect.gen(function* () {
 *   const nums = yield* Zap.make<number>();
 *   const strs = yield* Zap.map(nums, n => `value: ${n}`);
 *   // strs.stream emits transformed strings
 * }));
 * ```
 */
const _map = <A, B>(event: ZapShape<A>, f: (a: A) => B): Effect.Effect<ZapShape<B>, never, Scope.Scope> =>
  Effect.gen(function* () {
    const mapped = yield* _make<B>();

    yield* Effect.forkScoped(Stream.runForEach(event.stream, (value) => mapped.emit(f(value))));

    return mapped;
  });

/**
 * Filters a Zap, only forwarding values that satisfy the predicate.
 *
 * @example
 * ```ts
 * const program = Effect.scoped(Effect.gen(function* () {
 *   const nums = yield* Zap.make<number>();
 *   const evens = yield* Zap.filter(nums, n => n % 2 === 0);
 *   // evens.stream only receives even numbers
 * }));
 * ```
 */
const _filter = <T>(
  event: ZapShape<T>,
  predicate: (value: T) => boolean,
): Effect.Effect<ZapShape<T>, never, Scope.Scope> =>
  Effect.gen(function* () {
    const filtered = yield* _make<T>();

    yield* Effect.forkScoped(
      Stream.runForEach(event.stream, (value) => (predicate(value) ? filtered.emit(value) : Effect.void)),
    );

    return filtered;
  });

/**
 * Debounces a Zap, only emitting after `ms` milliseconds of silence.
 *
 * @example
 * ```ts
 * const program = Effect.scoped(Effect.gen(function* () {
 *   const input = yield* Zap.make<string>();
 *   const debounced = yield* Zap.debounce(input, Millis(300));
 *   // debounced.stream emits only after 300ms pause in input
 * }));
 * ```
 */
const _debounce = <T>(event: ZapShape<T>, ms: Millis): Effect.Effect<ZapShape<T>, never, Scope.Scope> =>
  Effect.gen(function* () {
    const debounced = yield* _make<T>();
    let pendingFiber: Fiber.Fiber<void> | null = null;

    yield* Effect.forkScoped(
      Stream.runForEach(event.stream, (value) =>
        Effect.gen(function* () {
          if (pendingFiber) {
            yield* Fiber.interrupt(pendingFiber);
          }
          pendingFiber = yield* Effect.forkChild(
            Effect.gen(function* () {
              yield* Effect.sleep(Duration.millis(ms));
              yield* debounced.emit(value);
            }),
          );
        }),
      ),
    );

    return debounced;
  });

/**
 * Throttles a Zap, allowing at most one emission per `ms` milliseconds.
 *
 * @example
 * ```ts
 * const program = Effect.scoped(Effect.gen(function* () {
 *   const scroll = yield* Zap.make<number>();
 *   const throttled = yield* Zap.throttle(scroll, Millis(16));
 *   // throttled.stream emits at most once every 16ms (~60fps)
 * }));
 * ```
 */
const _throttle = <T>(event: ZapShape<T>, ms: Millis): Effect.Effect<ZapShape<T>, never, Scope.Scope> =>
  Effect.gen(function* () {
    const throttled = yield* _make<T>();
    let lastEmitTime = 0;

    yield* Effect.forkScoped(
      Stream.runForEach(event.stream, (value) =>
        Effect.gen(function* () {
          const now = Date.now();
          if (now - lastEmitTime >= ms) {
            lastEmitTime = now;
            yield* throttled.emit(value);
          }
        }),
      ),
    );

    return throttled;
  });

/**
 * Zap -- push-based event channel backed by Effect PubSub.
 * Provides reactive event streams with map, filter, merge, debounce, and throttle.
 *
 * @example
 * ```ts
 * const program = Effect.scoped(Effect.gen(function* () {
 *   const zap = yield* Zap.make<number>();
 *   const doubled = yield* Zap.map(zap, n => n * 2);
 *   yield* zap.emit(5);
 *   // doubled.stream receives 10
 * }));
 * ```
 */
export const Zap = {
  make: _make,
  fromDOMEvent: _fromDOMEvent,
  merge: _merge,
  map: _map,
  filter: _filter,
  debounce: _debounce,
  throttle: _throttle,
};

export declare namespace Zap {
  /** Structural shape of a {@link Zap}: event-sourced reactive primitive exposing a discrete stream. */
  export type Shape<T> = ZapShape<T>;
}
