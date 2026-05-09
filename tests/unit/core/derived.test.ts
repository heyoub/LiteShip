/**
 * Derived<T> -- computed reactive value.
 *
 * Property: make with no sources produces a static value.
 * Property: combine recomputes when any input changes.
 * Property: map transforms values through function.
 */

import { describe, test, expect } from 'vitest';
import type { Scope} from 'effect';
import { Effect, Fiber, Stream } from 'effect';
import { Cell, Derived } from '@czap/core';

const runScoped = <A>(effect: Effect.Effect<A, never, Scope.Scope>): Promise<A> =>
  Effect.runPromise(Effect.scoped(effect));

// ---------------------------------------------------------------------------
// Derived.make
// ---------------------------------------------------------------------------

describe('Derived.make', () => {
  test('computes initial value', async () => {
    const result = await runScoped(
      Effect.gen(function* () {
        const d = yield* Derived.make(Effect.succeed(42));
        return yield* d.get;
      }),
    );
    expect(result).toBe(42);
  });

  test('static derived (no sources) never changes', async () => {
    const result = await runScoped(
      Effect.gen(function* () {
        let counter = 0;
        const d = yield* Derived.make(Effect.sync(() => ++counter));
        // Initial computation happens once
        const val = yield* d.get;
        expect(val).toBe(1);
        // No sources => no recomputation
        yield* Effect.sleep('10 millis');
        const val2 = yield* d.get;
        expect(val2).toBe(1);
        return val2;
      }),
    );
    expect(result).toBe(1);
  });

  test('recomputes when source emits', async () => {
    const result = await runScoped(
      Effect.gen(function* () {
        const cell = yield* Cell.make(10);
        const d = yield* Derived.make(cell.get, [cell.changes]);
        const updates = Effect.forkScoped(Stream.runCollect(Stream.take(d.changes, 2)));
        yield* cell.set(20);
        const fiber = yield* updates;
        const values = Array.from(yield* Fiber.join(fiber));
        return values.at(-1);
      }),
    );
    expect(result).toBe(20);
  });

  test('has _tag Derived', async () => {
    const result = await runScoped(
      Effect.gen(function* () {
        const d = yield* Derived.make(Effect.succeed(0));
        return d._tag;
      }),
    );
    expect(result).toBe('Derived');
  });
});

// ---------------------------------------------------------------------------
// Derived.combine
// ---------------------------------------------------------------------------

describe('Derived.combine', () => {
  test('combines cell values with combiner function', async () => {
    const result = await runScoped(
      Effect.gen(function* () {
        const a = yield* Cell.make(3);
        const b = yield* Cell.make(7);
        const sum = yield* Derived.combine([a, b] as const, (x: number, y: number) => x + y);
        return yield* sum.get;
      }),
    );
    expect(result).toBe(10);
  });

  test('produces consistent snapshots (no torn reads under rapid updates)', async () => {
    await runScoped(
      Effect.gen(function* () {
        const a = yield* Cell.make(0);
        const b = yield* Cell.make(0);

        // Combiner that exposes inconsistency: if x !== y a torn read occurred
        const derived = yield* Derived.combine(
          [a, b] as const,
          (x: number, y: number) => ({ x, y, consistent: x === y }),
        );

        // Always update both cells to the same value
        for (let i = 1; i <= 30; i++) {
          yield* a.set(i);
          yield* b.set(i);
        }

        yield* Effect.sleep('50 millis');

        const final = yield* derived.get;
        expect(final.x).toBe(30);
        expect(final.y).toBe(30);
        expect(final.consistent).toBe(true);
      }),
    );
  });

  test('recomputes when any input cell changes', async () => {
    const result = await runScoped(
      Effect.gen(function* () {
        const a = yield* Cell.make(1);
        const b = yield* Cell.make(2);
        const product = yield* Derived.combine([a, b] as const, (x: number, y: number) => x * y);
        const updates = Effect.forkScoped(Stream.runCollect(Stream.take(product.changes, 2)));
        yield* a.set(5);
        const fiber = yield* updates;
        const values = Array.from(yield* Fiber.join(fiber));
        return values.at(-1);
      }),
    );
    expect(result).toBe(10); // 5 * 2
  });
});

// ---------------------------------------------------------------------------
// Derived.map
// ---------------------------------------------------------------------------

describe('Derived.map', () => {
  test('transforms initial value', async () => {
    const result = await runScoped(
      Effect.gen(function* () {
        const d = yield* Derived.make(Effect.succeed(5));
        const doubled = yield* Derived.map(d, (n) => n * 2);
        return yield* doubled.get;
      }),
    );
    expect(result).toBe(10);
  });

  test('propagates mapped changes when the source derived updates', async () => {
    const result = await runScoped(
      Effect.gen(function* () {
        const cell = yield* Cell.make(2);
        const source = yield* Derived.make(cell.get, [cell.changes]);
        const mapped = yield* Derived.map(source, (value) => value * 3);
        const updates = Effect.forkScoped(Stream.runCollect(Stream.take(mapped.changes, 2)));
        yield* cell.set(4);
        const fiber = yield* updates;
        const values = Array.from(yield* Fiber.join(fiber));
        return values.at(-1);
      }),
    );

    expect(result).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// Derived.flatten
// ---------------------------------------------------------------------------

describe('Derived.flatten', () => {
  test('unwraps nested derived', async () => {
    const result = await runScoped(
      Effect.gen(function* () {
        const inner = yield* Derived.make(Effect.succeed(42));
        const outer = yield* Derived.make(Effect.succeed(inner));
        const flat = yield* Derived.flatten(outer);
        return yield* flat.get;
      }),
    );
    expect(result).toBe(42);
  });

  test('switches to the latest inner derived and emits its values', async () => {
    const result = await runScoped(
      Effect.gen(function* () {
        const innerA = yield* Cell.make(10);
        const innerB = yield* Cell.make(20);
        const derivedA = yield* Derived.make(innerA.get, [innerA.changes]);
        const derivedB = yield* Derived.make(innerB.get, [innerB.changes]);
        const outerCell = yield* Cell.make(derivedA);
        const nested = yield* Derived.make(outerCell.get, [outerCell.changes]);
        const flat = yield* Derived.flatten(nested);
        const updates = Effect.forkScoped(
          Stream.runCollect(flat.changes.pipe(Stream.filter((value) => value === 25), Stream.take(1))),
        );
        yield* Effect.sleep('1 millis');
        yield* outerCell.set(derivedB);
        yield* Effect.sleep('1 millis');
        const switched = yield* flat.get;
        yield* innerB.set(25);
        const fiber = yield* updates;
        const values = Array.from(yield* Fiber.join(fiber));
        return { switched, latest: values.at(-1), final: yield* flat.get };
      }),
    );

    expect(result.switched).toBe(20);
    expect(result.latest).toBe(25);
    expect(result.final).toBe(25);
  });
});
