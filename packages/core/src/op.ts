/**
 * `Op<A, E, R>` — `Effect.Effect` wrapper with named factories.
 *
 * @module
 */

import type { Scope, Result } from 'effect';
import { Effect, Schedule, Duration } from 'effect';
import type { Millis } from './brands.js';

interface OpShape<A, E = never, R = never> {
  readonly _tag: 'Op';
  readonly effect: Effect.Effect<A, E, R>;
  run(): Effect.Effect<A, E, R | Scope.Scope>;
  map<B>(f: (a: A) => B): OpShape<B, E, R>;
  flatMap<B, E2, R2>(f: (a: A) => OpShape<B, E2, R2>): OpShape<B, E | E2, R | R2>;
}

type OpValue<T extends OpShape<unknown, unknown, unknown>> = T extends OpShape<infer A, unknown, unknown> ? A : never;
type OpError<T extends OpShape<unknown, unknown, unknown>> = T extends OpShape<unknown, infer E, unknown> ? E : never;
type OpRequirement<T extends OpShape<unknown, unknown, unknown>> =
  T extends OpShape<unknown, unknown, infer R> ? R : never;
type OpValues<T extends readonly OpShape<unknown, unknown, unknown>[]> = { [K in keyof T]: OpValue<T[K]> };
type SettledOpValues<T extends readonly OpShape<unknown, unknown, unknown>[]> = {
  [K in keyof T]: Result.Result<OpValue<T[K]>, OpError<T[K]>>;
};

/**
 * Wraps an Effect into an Op, providing `.map()` and `.flatMap()` chaining.
 *
 * @example
 * ```ts
 * const op = Op.make(Effect.succeed(42));
 * const doubled = op.map(n => n * 2);
 * const result = Effect.runSync(doubled.run()); // 84
 * ```
 */
const _make = <A, E = never, R = never>(effect: Effect.Effect<A, E, R>): OpShape<A, E, R> => ({
  _tag: 'Op' as const,
  effect,
  run: () => effect,
  map: <B>(fn: (a: A) => B): OpShape<B, E, R> => _make(Effect.map(effect, fn)),
  flatMap: <B, E2, R2>(fn: (a: A) => OpShape<B, E2, R2>): OpShape<B, E | E2, R | R2> =>
    _make(Effect.flatMap(effect, (a) => fn(a).effect)),
});

/**
 * Creates an Op from a Promise-returning function, catching errors as `Error`.
 *
 * @example
 * ```ts
 * const op = Op.fromPromise(() => fetch('/api/data').then(r => r.json()));
 * const result = await Effect.runPromise(op.run());
 * console.log(result); // parsed JSON response
 * ```
 */
const _fromPromise = <A>(f: () => Promise<A>): OpShape<A, Error> =>
  _make(
    Effect.tryPromise({
      try: f,
      catch: (error) => (error instanceof Error ? error : new Error(String(error))),
    }),
  );

/**
 * Creates an Op that immediately succeeds with the given value.
 *
 * @example
 * ```ts
 * const op = Op.succeed({ name: 'dark', contrast: 0.9 });
 * const result = Effect.runSync(op.run()); // { name: 'dark', contrast: 0.9 }
 * ```
 */
const _succeed = <A>(value: A): OpShape<A> => _make(Effect.succeed(value));

/**
 * Creates an Op that immediately fails with the given error.
 *
 * @example
 * ```ts
 * const op = Op.fail(new Error('GPU not available'));
 * // Effect.runSync(op.run()) would throw
 * ```
 */
const _fail = <E>(error: E): OpShape<never, E> => _make(Effect.fail(error));

/**
 * Runs all Ops concurrently and returns their results as a tuple.
 * Fails if any Op fails.
 *
 * @example
 * ```ts
 * const a = Op.succeed(10);
 * const b = Op.succeed('hello');
 * const combined = Op.all([a, b] as const);
 * const [num, str] = Effect.runSync(combined.run()); // [10, 'hello']
 * ```
 */
// Effect.all's overloads infer tuple results only when the input shape itself is tuple-typed.
// `tasks.map(...)` widens to unknown[], so we contain one cast into a typed wrapper and
// apply it at the boundary where the tuple→Op product is materialized.
const _all = <T extends readonly OpShape<unknown, unknown, unknown>[]>(
  tasks: T,
): OpShape<OpValues<T>, OpError<T[number]>, OpRequirement<T[number]>> => {
  const effects = tasks.map((task) => task.effect);
  const combined = Effect.all(effects, { concurrency: 'unbounded' }) as unknown as Effect.Effect<
    OpValues<T>,
    OpError<T[number]>,
    OpRequirement<T[number]>
  >;
  return _make(combined);
};

/**
 * Runs all Ops concurrently and returns a Result for each, never failing.
 * Each result is either a success or a failure.
 *
 * @example
 * ```ts
 * const a = Op.succeed(1);
 * const b = Op.fail(new Error('oops'));
 * const settled = Op.allSettled([a, b] as const);
 * const results = Effect.runSync(settled.run());
 * // results[0] is Result.success(1), results[1] is Result.failure(Error)
 * ```
 */
// Mirrors _all: one boundary cast from unknown[] back to the tuple-projected product.
const _allSettled = <T extends readonly OpShape<unknown, unknown, unknown>[]>(
  tasks: T,
): OpShape<SettledOpValues<T>, never, OpRequirement<T[number]>> => {
  const resultEffects = tasks.map((task) => Effect.result(task.effect));
  const combined = Effect.all(resultEffects, { concurrency: 'unbounded' }) as unknown as Effect.Effect<
    SettledOpValues<T>,
    never,
    OpRequirement<T[number]>
  >;
  return _make(combined);
};

/**
 * Races multiple Ops concurrently, returning the first to complete.
 * Fails with an error if the array is empty.
 *
 * @example
 * ```ts
 * const fast = Op.succeed('fast');
 * const slow = Op.fromPromise(() => new Promise(r => setTimeout(() => r('slow'), 100)));
 * const winner = Op.race([fast, slow]);
 * const result = Effect.runSync(winner.run()); // 'fast'
 * ```
 */
const _race = <A, E, R>(tasks: ReadonlyArray<OpShape<A, E, R>>): OpShape<A, E | Error, R> => {
  if (tasks.length === 0) {
    return _fail(new Error('Op.race: empty array'));
  }
  if (tasks.length === 1) {
    return tasks[0]!;
  }
  const effects = tasks.map((task) => task.effect);
  const raced = effects.reduce((acc, effect) => Effect.race(acc, effect));
  return _make(raced);
};

/**
 * Retries a failing Op with exponential backoff.
 *
 * @example
 * ```ts
 * const flaky = Op.fromPromise(() => fetch('/unstable-api').then(r => r.json()));
 * const resilient = Op.retry(flaky, { times: 3, delay: Millis(200), factor: 2 });
 * const result = await Effect.runPromise(resilient.run());
 * ```
 */
const _retry = <A, E, R>(
  task: OpShape<A, E, R>,
  options: { times: number; delay?: Millis; factor?: number },
): OpShape<A, E, R> => {
  const delay = options.delay ?? 100;
  const factor = options.factor ?? 2;

  const schedule = Schedule.exponential(Duration.millis(delay), factor).pipe(
    Schedule.both(Schedule.recurs(options.times)),
  );

  return _make(Effect.retry(task.effect, schedule));
};

/**
 * Wraps an Op with a timeout, failing with an Error if it exceeds the given duration.
 *
 * @example
 * ```ts
 * const slow = Op.fromPromise(() => new Promise(r => setTimeout(() => r('done'), 5000)));
 * const bounded = Op.timeout(slow, Millis(1000));
 * // Will fail with Error('Op timed out after 1000ms') if not resolved in time
 * ```
 */
const _timeout = <A, E, R>(task: OpShape<A, E, R>, ms: Millis): OpShape<A, E | Error, R> =>
  _make(
    Effect.timeout(task.effect, Duration.millis(ms)).pipe(
      Effect.catchTag('TimeoutError', () => Effect.fail(new Error(`Op timed out after ${ms}ms`))),
    ),
  );

/**
 * Op -- Effect.Effect wrapper providing named factories and combinators
 * for async operations with retry, timeout, race, and parallel execution.
 *
 * @example
 * ```ts
 * const op = Op.succeed(42).map(n => n * 2);
 * const result = Effect.runSync(op.run()); // 84
 *
 * const tasks = Op.all([Op.succeed(1), Op.succeed(2)] as const);
 * const [a, b] = Effect.runSync(tasks.run()); // [1, 2]
 * ```
 */
export const Op = {
  make: _make,
  fromPromise: _fromPromise,
  succeed: _succeed,
  fail: _fail,
  all: _all,
  allSettled: _allSettled,
  race: _race,
  retry: _retry,
  timeout: _timeout,
};

export declare namespace Op {
  /** Structural shape of an {@link Op}: a thin alias over `Effect.Effect<A, E, R>` produced by the `Op.*` factories. */
  export type Shape<A, E = never, R = never> = OpShape<A, E, R>;
}
