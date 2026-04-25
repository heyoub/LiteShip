/**
 * Cell<T> -- writable reactive primitive.
 *
 * Property: set then get returns the set value.
 * Property: update applies function to current value.
 * Property: fromStream syncs cell to stream values.
 */

import { describe, test, expect } from 'vitest';
import fc from 'fast-check';
import type { Scope} from 'effect';
import { Effect, Stream } from 'effect';
import { Cell } from '@czap/core';

const runScoped = <A>(effect: Effect.Effect<A, never, Scope.Scope>): Promise<A> =>
  Effect.runPromise(Effect.scoped(effect));

// ---------------------------------------------------------------------------
// Cell.make
// ---------------------------------------------------------------------------

describe('Cell.make', () => {
  test('initial value is retrievable via get', async () => {
    const cell = await Effect.runPromise(Cell.make(42));
    const value = await Effect.runPromise(cell.get);
    expect(value).toBe(42);
  });

  test('set updates value', async () => {
    const cell = await Effect.runPromise(Cell.make(0));
    await Effect.runPromise(cell.set(99));
    const value = await Effect.runPromise(cell.get);
    expect(value).toBe(99);
  });

  test('update applies function to current value', async () => {
    const cell = await Effect.runPromise(Cell.make(10));
    await Effect.runPromise(cell.update((n) => n * 2));
    const value = await Effect.runPromise(cell.get);
    expect(value).toBe(20);
  });

  test('update with identity preserves value', async () => {
    const cell = await Effect.runPromise(Cell.make('hello'));
    await Effect.runPromise(cell.update((x) => x));
    const value = await Effect.runPromise(cell.get);
    expect(value).toBe('hello');
  });

  test('has _tag Cell', async () => {
    const cell = await Effect.runPromise(Cell.make(0));
    expect(cell._tag).toBe('Cell');
  });
});

// ---------------------------------------------------------------------------
// Cell.fromStream
// ---------------------------------------------------------------------------

describe('Cell.fromStream', () => {
  test('initial value is set before stream starts', async () => {
    const result = await runScoped(
      Effect.gen(function* () {
        const cell = yield* Cell.fromStream(42, Stream.empty);
        return yield* cell.get;
      }),
    );
    expect(result).toBe(42);
  });

  test('stream values update cell', async () => {
    const result = await runScoped(
      Effect.gen(function* () {
        const cell = yield* Cell.fromStream(0, Stream.make(1, 2, 3));
        // Give the forked fiber time to consume
        yield* Effect.sleep('10 millis');
        return yield* cell.get;
      }),
    );
    expect(result).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Cell.map
// ---------------------------------------------------------------------------

describe('Cell.map', () => {
  test('maps initial value', async () => {
    const result = await runScoped(
      Effect.gen(function* () {
        const cell = yield* Effect.flatMap(Cell.make(5), (c) => Cell.map(c, (n) => n * 10));
        return yield* cell.get;
      }),
    );
    expect(result).toBe(50);
  });

  test('propagates updates through mapping function', async () => {
    const result = await runScoped(
      Effect.gen(function* () {
        const base = yield* Cell.make(1);
        const mapped = yield* Cell.map(base, (n) => n + 100);
        yield* base.set(5);
        yield* Effect.sleep('10 millis');
        return yield* mapped.get;
      }),
    );
    expect(result).toBe(105);
  });
});

// ---------------------------------------------------------------------------
// Cell.all
// ---------------------------------------------------------------------------

describe('Cell.all', () => {
  test('combines initial values into tuple', async () => {
    const result = await runScoped(
      Effect.gen(function* () {
        const a = yield* Cell.make(1);
        const b = yield* Cell.make('hello');
        const combined = yield* Cell.all([a, b] as const);
        return yield* combined.get;
      }),
    );
    expect(result).toEqual([1, 'hello']);
  });

  test('reads a consistent snapshot (no torn reads under rapid updates)', async () => {
    const result = await runScoped(
      Effect.gen(function* () {
        const a = yield* Cell.make(0);
        const b = yield* Cell.make(0);
        const combined = yield* Cell.all([a, b] as const);

        // Rapidly update both cells many times, always keeping them in sync
        for (let i = 1; i <= 50; i++) {
          yield* a.set(i);
          yield* b.set(i);
        }

        // Allow stream propagation to settle
        yield* Effect.sleep('50 millis');

        const snapshot = yield* combined.get;

        // With torn reads, snapshot[0] could differ from snapshot[1].
        // After the loop both cells are at 50, so the combined value
        // must converge to [50, 50].
        expect(snapshot[0]).toBe(snapshot[1]);
        expect(snapshot).toEqual([50, 50]);
        return snapshot;
      }),
    );
  });

  test('updates when any cell changes', async () => {
    const result = await runScoped(
      Effect.gen(function* () {
        const a = yield* Cell.make(1);
        const b = yield* Cell.make(2);
        const combined = yield* Cell.all([a, b] as const);
        yield* a.set(10);
        yield* Effect.sleep('10 millis');
        return yield* combined.get;
      }),
    );
    expect(result).toEqual([10, 2]);
  });
});

// ---------------------------------------------------------------------------
// Property-based
// ---------------------------------------------------------------------------

describe('Cell properties', () => {
  test('set then get roundtrips', () => {
    fc.assert(
      fc.asyncProperty(fc.integer(), async (value) => {
        const cell = await Effect.runPromise(Cell.make(0));
        await Effect.runPromise(cell.set(value));
        const got = await Effect.runPromise(cell.get);
        expect(got).toBe(value);
      }),
    );
  });
});
