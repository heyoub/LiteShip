/**
 * Cell<T> -- writable reactive primitive.
 *
 * @module
 */

import type { Scope } from 'effect';
import { Effect, Stream, SubscriptionRef, Semaphore } from 'effect';
import { tupleMap } from './tuple.js';

interface CellShape<T> {
  readonly _tag: 'Cell';
  readonly ref: SubscriptionRef.SubscriptionRef<T>;
  readonly changes: Stream.Stream<T>;
  readonly get: Effect.Effect<T>;
  set(value: T): Effect.Effect<void>;
  update(f: (current: T) => T): Effect.Effect<void>;
}

const _make = <T>(initial: T): Effect.Effect<CellShape<T>> =>
  Effect.gen(function* () {
    const ref = yield* SubscriptionRef.make(initial);

    return {
      _tag: 'Cell' as const,
      ref,
      changes: SubscriptionRef.changes(ref),
      get: SubscriptionRef.get(ref),
      set: (value: T) => SubscriptionRef.set(ref, value),
      update: (f: (current: T) => T) => SubscriptionRef.update(ref, f),
    };
  });

const _fromStream = <T>(initial: T, source: Stream.Stream<T>): Effect.Effect<CellShape<T>, never, Scope.Scope> =>
  Effect.gen(function* () {
    const cell = yield* _make(initial);

    yield* Effect.forkScoped(Stream.runForEach(source, (value) => cell.set(value)));

    return cell;
  });

/**
 * Read all values from a tuple of cells, preserving the tuple type `T`.
 *
 * Sanctioned single cast site for Cell combinators. Two type-system gaps force
 * this containment:
 *   1. `tupleMap`'s callback signature collapses to `U = Effect<T[number]>`,
 *      losing the per-element `Effect<T[K]>` relationship.
 *   2. `Effect.all`'s tuple overload returns a mapped-tuple result
 *      `{ -readonly [K in keyof ...]: _A }` that TypeScript cannot fold back
 *      to the input tuple type `T` (`T` could be instantiated with an
 *      arbitrary subtype per the structural contravariance rules).
 *
 * The runtime behavior is provably correct: `tupleMap` is total and order-
 * preserving, `Effect.all` with an array input preserves positional order and
 * arity, so the resulting values are `T` by construction.
 */
export const readAllCellValues = <T extends readonly unknown[]>(
  cells: { readonly [K in keyof T]: CellShape<T[K]> },
): Effect.Effect<T> => {
  const gets = tupleMap(cells, (cell) => cell.get);
  return Effect.all(gets, { concurrency: 'unbounded' }) as unknown as Effect.Effect<T>;
};

const _all = <const T extends readonly unknown[]>(
  cells: { readonly [K in keyof T]: CellShape<T[K]> },
): Effect.Effect<CellShape<T>, never, Scope.Scope> => {
  const readAll = readAllCellValues(cells);

  return Effect.gen(function* () {
    const values = yield* readAll;
    const combined = yield* _make(values);
    const sem = Semaphore.makeUnsafe(1);

    yield* Effect.forkScoped(
      Effect.gen(function* () {
        const changeStreams = tupleMap(cells, (cell) => cell.changes);
        const updates = changeStreams.map((changes) =>
          Stream.runForEach(changes, () =>
            Semaphore.withPermits(
              sem,
              1,
            )(
              Effect.gen(function* () {
                const newValues = yield* readAll;
                yield* combined.set(newValues);
              }),
            ),
          ),
        );
        yield* Effect.all(updates, { concurrency: 'unbounded' });
      }),
    );

    return combined;
  });
};

const _map = <T, U>(cell: CellShape<T>, fn: (value: T) => U): Effect.Effect<CellShape<U>, never, Scope.Scope> =>
  Effect.gen(function* () {
    const initialValue = yield* cell.get;
    const mappedInitial = fn(initialValue);
    const mapped = yield* _make(mappedInitial);

    yield* Effect.forkScoped(Stream.runForEach(cell.changes, (value) => mapped.set(fn(value))));

    return mapped;
  });

/**
 * Cell — mutable reactive primitive backed by `SubscriptionRef`.
 * The workhorse of czap's reactive graph: `get` for a snapshot, `set` to
 * push, `changes` for the stream of subsequent values.
 */
export const Cell = {
  /** Build a cell with an initial value. */
  make: _make,
  /** Seed a cell with an initial value and mirror every stream emission into it. */
  fromStream: _fromStream,
  /** Tuple-combine cells into a single cell of their current values. */
  all: _all,
  /** Scoped `map` — derive a new cell by applying `fn` to every emission. */
  map: _map,
};

export declare namespace Cell {
  /** Structural shape of a {@link Cell}: `_tag`, `get`, `set`, `changes`. */
  export type Shape<T> = CellShape<T>;
}
