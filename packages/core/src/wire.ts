/**
 * `Wire<T, E>` — fluent stream wrapper.
 *
 * @module
 */

import { Effect, Stream, Queue } from 'effect';
import type { Millis } from './brands.js';

// Fluent composition: chainable transform pipeline for Effect streams, enabling .map/.filter/.merge without breaking the Effect fiber model.

interface WireShape<T, E = never> {
  readonly _tag: 'Wire';
  readonly stream: Stream.Stream<T, E>;
  map<B>(f: (a: T) => B): WireShape<B, E>;
  filter(f: (a: T) => boolean): WireShape<T, E>;
  take(n: number): WireShape<T, E>;
  takeUntil(predicate: (a: T) => boolean): WireShape<T, E>;
  debounce(ms: Millis): WireShape<T, E>;
  throttle(ms: Millis): WireShape<T, E>;
  scan<B>(initial: B, f: (acc: B, value: T) => B): WireShape<B, E>;
  flatMap<B, E2>(f: (a: T) => WireShape<B, E2>): WireShape<B, E | E2>;
  merge<B, E2>(other: WireShape<B, E2>): WireShape<T | B, E | E2>;
  run(): Effect.Effect<void, E>;
  runCollect(): Effect.Effect<T[], E>;
}

function wrap<T, E = never>(stream: Stream.Stream<T, E>): WireShape<T, E> {
  const wireStream: WireShape<T, E> = {
    _tag: 'Wire' as const,
    stream,

    map: <B>(f: (a: T) => B) => wrap<B, E>(Stream.map(stream, f)),

    filter: (f: (a: T) => boolean) => wrap<T, E>(Stream.filter(stream, f)),

    take: (n: number) => wrap<T, E>(Stream.take(stream, n)),

    takeUntil: (predicate: (a: T) => boolean) => wrap<T, E>(Stream.takeUntil(stream, predicate)),

    debounce: (ms: Millis) => wrap<T, E>(Stream.debounce(stream, ms)),

    throttle: (ms: Millis) =>
      wrap<T, E>(
        Stream.throttle(stream, {
          cost: () => 1,
          units: 1,
          duration: ms,
          strategy: 'enforce',
        }),
      ),

    scan: <B>(initial: B, f: (acc: B, value: T) => B) => wrap<B, E>(Stream.scan(stream, initial, f)),

    flatMap: <B, E2>(f: (a: T) => WireShape<B, E2>) => wrap<B, E | E2>(Stream.flatMap(stream, (a) => f(a).stream)),

    merge: <B, E2>(other: WireShape<B, E2>) => wrap<T | B, E | E2>(Stream.merge(stream, other.stream)),

    run: () => Stream.runDrain(stream),

    runCollect: () => Effect.map(Stream.runCollect(stream), (chunk) => Array.from<T>(chunk)),
  };

  return wireStream;
}

/**
 * Wraps an Effect Stream into a fluent Wire with chainable operators.
 *
 * @example
 * ```ts
 * const wire = Wire.from(Stream.make(1, 2, 3));
 * const doubled = wire.map(n => n * 2).filter(n => n > 2);
 * const results = Effect.runSync(doubled.runCollect()); // [4, 6]
 * ```
 */
const _from = <T, E = never>(stream: Stream.Stream<T, E>): WireShape<T, E> => wrap(stream);

/**
 * Creates a Wire from a Server-Sent Events endpoint.
 * The EventSource is cleaned up when the stream finalizes.
 *
 * @example
 * ```ts
 * const wire = Wire.fromSSE('/api/events');
 * const parsed = wire.map(evt => JSON.parse(evt.data));
 * await Effect.runPromise(Wire.runForEach(parsed, msg => Effect.log(msg)));
 * ```
 */
const _fromSSE = (url: string, options?: EventSourceInit): WireShape<MessageEvent, Error> => {
  const stream = Stream.callback<MessageEvent, Error>((queue) =>
    Effect.gen(function* () {
      const eventSource = new EventSource(url, options);
      let closed = false;

      const shutdown = (): void => {
        if (closed) return;
        closed = true;
        Queue.shutdown(queue).pipe(Effect.runSync);
      };

      eventSource.onmessage = (event) => {
        Queue.offerUnsafe(queue, event);
      };

      eventSource.onerror = () => {
        eventSource.close();
        shutdown();
      };

      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          eventSource.close();
          shutdown();
        }),
      );

      yield* Effect.never;
    }),
  );

  return wrap(stream);
};

/**
 * Creates a Wire from a WebSocket connection.
 * The socket is closed when the stream finalizes.
 *
 * @example
 * ```ts
 * const wire = Wire.fromWebSocket('wss://example.com/ws');
 * const messages = wire.map(evt => evt.data as string);
 * await Effect.runPromise(Wire.runForEach(messages, m => Effect.log(m)));
 * ```
 */
const _fromWebSocket = (url: string, protocols?: string | string[]): WireShape<MessageEvent, Error> => {
  const stream = Stream.callback<MessageEvent, Error>((queue) =>
    Effect.gen(function* () {
      const ws = new WebSocket(url, protocols);
      let closed = false;

      const shutdown = (): void => {
        if (closed) return;
        closed = true;
        Queue.shutdown(queue).pipe(Effect.runSync);
      };

      ws.onmessage = (event) => {
        Queue.offerUnsafe(queue, event);
      };

      ws.onerror = () => {
        shutdown();
      };

      ws.onclose = () => {
        shutdown();
      };

      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            ws.close();
          }
          shutdown();
        }),
      );

      yield* Effect.never;
    }),
  );

  return wrap(stream);
};

/**
 * Creates a Wire from any AsyncIterable source.
 *
 * @example
 * ```ts
 * async function* gen() { yield 1; yield 2; yield 3; }
 * const wire = Wire.fromAsyncIterable(gen());
 * const results = await Effect.runPromise(wire.runCollect()); // [1, 2, 3]
 * ```
 */
const _fromAsyncIterable = <T>(iterable: AsyncIterable<T>): WireShape<T, Error> => {
  const stream = Stream.fromAsyncIterable(iterable, (e) => (e instanceof Error ? e : new Error(String(e))));
  return wrap(stream);
};

/**
 * Zips two Wires into a Wire of tuples, pairing elements pairwise.
 *
 * @example
 * ```ts
 * const a = Wire.from(Stream.make(1, 2));
 * const b = Wire.from(Stream.make('a', 'b'));
 * const zipped = Wire.zip(a, b);
 * const results = Effect.runSync(zipped.runCollect()); // [[1,'a'], [2,'b']]
 * ```
 */
const _zip = <A, B>(a: WireShape<A>, b: WireShape<B>): WireShape<readonly [A, B]> =>
  wrap(Stream.zip(a.stream, b.stream));

/**
 * Merges multiple Wires into a single Wire, interleaving their emissions.
 *
 * @example
 * ```ts
 * const a = Wire.from(Stream.make(1, 2));
 * const b = Wire.from(Stream.make(3, 4));
 * const merged = Wire.merge([a, b]);
 * const results = Effect.runSync(merged.runCollect()); // [1, 2, 3, 4] (order varies)
 * ```
 */
const _merge = <T, E>(streams: ReadonlyArray<WireShape<T, E>>): WireShape<T, E> => {
  const effectStreams = streams.map((s) => s.stream);
  const merged = Stream.mergeAll(effectStreams, { concurrency: 'unbounded' });
  return wrap(merged);
};

/**
 * Collects all values from a Wire into an array.
 *
 * @example
 * ```ts
 * const wire = Wire.from(Stream.make(10, 20, 30));
 * const values = Effect.runSync(Wire.runCollect(wire)); // [10, 20, 30]
 * ```
 */
const _runCollect = <T, E>(stream: WireShape<T, E>): Effect.Effect<ReadonlyArray<T>, E> =>
  Effect.map(Stream.runCollect(stream.stream), (chunk) => Array.from(chunk));

/**
 * Runs an effectful function for each value emitted by the Wire.
 *
 * @example
 * ```ts
 * const wire = Wire.from(Stream.make('hello', 'world'));
 * await Effect.runPromise(Wire.runForEach(wire, s => Effect.log(s)));
 * // Logs: hello, world
 * ```
 */
const _runForEach = <T, SE, E, R>(
  stream: WireShape<T, SE>,
  fn: (t: T) => Effect.Effect<void, E, R>,
): Effect.Effect<void, SE | E, R> => Stream.runForEach(stream.stream, fn);

/**
 * Wire -- fluent stream wrapper with chainable operators for map, filter,
 * scan, debounce, throttle, merge, and more. Wraps Effect Streams.
 *
 * @example
 * ```ts
 * const wire = Wire.from(Stream.make(1, 2, 3, 4, 5));
 * const result = wire.filter(n => n > 2).map(n => n * 10);
 * const values = Effect.runSync(result.runCollect()); // [30, 40, 50]
 * ```
 */
export const Wire = {
  from: _from,
  fromSSE: _fromSSE,
  fromWebSocket: _fromWebSocket,
  fromAsyncIterable: _fromAsyncIterable,
  zip: _zip,
  merge: _merge,
  runCollect: _runCollect,
  runForEach: _runForEach,
};

export declare namespace Wire {
  /** Structural shape of a {@link Wire}: a fluent wrapper over `Stream.Stream<T, E>`. */
  export type Shape<T, E = never> = WireShape<T, E>;
}
