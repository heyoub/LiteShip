/**
 * Derived<T> -- computed reactive value.
 *
 * @module
 */

import type { Scope } from 'effect';
import { Effect, Stream, SubscriptionRef } from 'effect';
import { tupleMap } from './tuple.js';
import type { Cell } from './cell.js';
import { readAllCellValues } from './cell.js';

interface DerivedShape<T> {
  readonly _tag: 'Derived';
  readonly changes: Stream.Stream<T>;
  readonly get: Effect.Effect<T>;
}

const _make = <T>(
  compute: Effect.Effect<T>,
  sources: ReadonlyArray<Stream.Stream<unknown>> = [],
): Effect.Effect<DerivedShape<T>, never, Scope.Scope> =>
  Effect.gen(function* () {
    const initialValue = yield* compute;
    const ref = yield* SubscriptionRef.make(initialValue);

    if (sources.length > 0) {
      const merged = Stream.mergeAll(sources, { concurrency: 'unbounded' });
      yield* Effect.forkScoped(
        Stream.runForEach(merged, () =>
          Effect.gen(function* () {
            const newValue = yield* compute;
            yield* SubscriptionRef.set(ref, newValue);
          }),
        ),
      );
    }

    return {
      _tag: 'Derived' as const,
      changes: SubscriptionRef.changes(ref),
      get: SubscriptionRef.get(ref),
    };
  });

const _combine = <T extends readonly unknown[], U>(
  cells: { [K in keyof T]: Cell.Shape<T[K]> },
  combiner: (...args: T) => U,
): Effect.Effect<DerivedShape<U>, never, Scope.Scope> => {
  const readAll = readAllCellValues<T>(cells);

  return Effect.gen(function* () {
    const initialValues = yield* readAll;
    const initialResult = combiner(...initialValues);
    const ref = yield* SubscriptionRef.make(initialResult);

    const cellStreams = tupleMap(cells, (cell) => cell.changes);
    const combinedStream = Stream.mergeAll(cellStreams, {
      concurrency: 'unbounded',
    }).pipe(
      Stream.mapEffect(() =>
        Effect.gen(function* () {
          const currentValues = yield* readAll;
          const result = combiner(...currentValues);
          yield* SubscriptionRef.set(ref, result);
          return result;
        }),
      ),
    );

    yield* Effect.forkScoped(Stream.runDrain(combinedStream));

    return {
      _tag: 'Derived' as const,
      changes: SubscriptionRef.changes(ref),
      get: SubscriptionRef.get(ref),
    };
  });
};

const _map = <A, B>(derived: DerivedShape<A>, f: (a: A) => B): Effect.Effect<DerivedShape<B>, never, Scope.Scope> =>
  Effect.gen(function* () {
    const initialValue = yield* derived.get;
    const mappedValue = f(initialValue);
    const ref = yield* SubscriptionRef.make(mappedValue);

    const mappedStream = derived.changes.pipe(
      Stream.map(f),
      Stream.tap((value) => SubscriptionRef.set(ref, value)),
    );

    yield* Effect.forkScoped(Stream.runDrain(mappedStream));

    return {
      _tag: 'Derived' as const,
      changes: SubscriptionRef.changes(ref),
      get: SubscriptionRef.get(ref),
    };
  });

const _flatten = <T>(nested: DerivedShape<DerivedShape<T>>): Effect.Effect<DerivedShape<T>, never, Scope.Scope> =>
  Effect.gen(function* () {
    const initialInner = yield* nested.get;
    const initialValue = yield* initialInner.get;
    const ref = yield* SubscriptionRef.make(initialValue);

    const flattenedStream = nested.changes.pipe(
      Stream.switchMap((inner) => {
        let skipInitialReplay = true;
        return Stream.concat(
          Stream.make(inner).pipe(Stream.mapEffect((currentInner) => currentInner.get)),
          inner.changes.pipe(
            Stream.filter(() => {
              if (skipInitialReplay) {
                skipInitialReplay = false;
                return false;
              }
              return true;
            }),
          ),
        );
      }),
      Stream.tap((value) => SubscriptionRef.set(ref, value)),
    );

    yield* Effect.forkScoped(Stream.runDrain(flattenedStream));

    return {
      _tag: 'Derived' as const,
      changes: SubscriptionRef.changes(ref),
      get: SubscriptionRef.get(ref),
    };
  });

/**
 * Derived — read-only reactive view computed from upstream {@link Cell}s.
 * A `Derived` recomputes lazily and pushes the new value into its own stream
 * when any dependency changes; composes via `combine`, `map`, and `flatten`.
 */
export const Derived = {
  /** Build a derived cell from a factory computing against upstream sources. */
  make: _make,
  /** Combine multiple cells into a single derived cell of their tuple. */
  combine: _combine,
  /** Pure projection of an existing cell/derived. */
  map: _map,
  /** Flatten a derived-of-derived into a single derived of the inner value. */
  flatten: _flatten,
};

export declare namespace Derived {
  /** Structural shape of a {@link Derived}: `_tag`, `get`, `changes`. */
  export type Shape<T> = DerivedShape<T>;
}
