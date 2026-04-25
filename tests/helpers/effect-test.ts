/**
 * Effect-aware test utilities.
 *
 * Helpers for running scoped effects, collecting streams,
 * and other common test patterns with Effect.
 */

import type { Scope} from 'effect';
import { Effect, Stream, Chunk } from 'effect';

/**
 * Run a scoped effect synchronously.
 * Useful for tests that need Scope but are otherwise synchronous.
 */
export const runScoped = <A, E = never>(effect: Effect.Effect<A, E, Scope.Scope>): A =>
  Effect.runSync(Effect.scoped(effect));

/**
 * Run a scoped effect as a Promise.
 * Useful for tests with async Effect operations.
 */
export const runScopedAsync = <A, E = never>(effect: Effect.Effect<A, E, Scope.Scope>): Promise<A> =>
  Effect.runPromise(Effect.scoped(effect));

/**
 * Collect up to `n` items from a stream, synchronously.
 */
export const collectStream = <A, E = never>(stream: Stream.Stream<A, E>, n?: number): A[] => {
  const bounded = n !== undefined ? Stream.take(stream, n) : stream;
  const chunk = Effect.runSync(Stream.runCollect(bounded));
  return Array.from(chunk) as A[];
};

/**
 * Collect up to `n` items from a stream, as a Promise.
 */
export const collectStreamAsync = <A, E = never>(stream: Stream.Stream<A, E>, n?: number): Promise<A[]> => {
  const bounded = n !== undefined ? Stream.take(stream, n) : stream;
  return Effect.runPromise(Effect.map(Stream.runCollect(bounded), (chunk) => Array.from(chunk) as A[]));
};

/**
 * Drain a stream (consume all items, discard values).
 */
export const drainStream = <A, E = never>(stream: Stream.Stream<A, E>): void => {
  Effect.runSync(Stream.runDrain(stream));
};

/**
 * Drain a stream asynchronously.
 */
export const drainStreamAsync = <A, E = never>(stream: Stream.Stream<A, E>): Promise<void> =>
  Effect.runPromise(Stream.runDrain(stream));
