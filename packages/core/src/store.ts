/**
 * `Store<S, Msg>` — TEA-style reducer store.
 *
 * @module
 */

import type { Stream } from 'effect';
import { Effect, SubscriptionRef, Semaphore } from 'effect';

interface StoreShape<S, Msg> {
  readonly _tag: 'Store';
  readonly get: Effect.Effect<S>;
  readonly changes: Stream.Stream<S>;
  dispatch(msg: Msg): Effect.Effect<void>;
}

interface EffectfulStoreShape<S, Msg, E = never, R = never> {
  readonly _tag: 'Store';
  readonly get: Effect.Effect<S>;
  readonly changes: Stream.Stream<S>;
  dispatch(msg: Msg): Effect.Effect<void, E, R>;
}

const _make = <S, Msg>(initial: S, reducer: (state: S, msg: Msg) => S): Effect.Effect<StoreShape<S, Msg>> =>
  Effect.gen(function* () {
    const ref = yield* SubscriptionRef.make(initial);

    return {
      _tag: 'Store' as const,
      get: SubscriptionRef.get(ref),
      changes: SubscriptionRef.changes(ref),
      dispatch: (msg: Msg) => SubscriptionRef.update(ref, (state) => reducer(state, msg)),
    };
  });

const _makeWithEffect = <S, Msg, E, R>(
  initial: S,
  reducer: (state: S, msg: Msg) => Effect.Effect<S, E, R>,
): Effect.Effect<EffectfulStoreShape<S, Msg, E, R>> =>
  Effect.gen(function* () {
    const ref = yield* SubscriptionRef.make(initial);
    const mutex = yield* Semaphore.make(1);

    return {
      _tag: 'Store' as const,
      get: SubscriptionRef.get(ref),
      changes: SubscriptionRef.changes(ref),
      dispatch: (msg: Msg) =>
        mutex.withPermits(1)(
          Effect.gen(function* () {
            const current = yield* SubscriptionRef.get(ref);
            const next = yield* reducer(current, msg);
            yield* SubscriptionRef.set(ref, next);
          }),
        ),
    };
  });

/**
 * Store — TEA-style state container.
 * Build with an initial state and a pure `reducer(state, msg) => state`, then
 * dispatch messages; the store publishes the resulting state via `changes`.
 * Use `makeWithEffect` when the reducer is itself an `Effect`.
 */
export const Store = {
  /** Synchronous reducer store. */
  make: _make,
  /** Reducer store where state transitions are themselves `Effect`s. */
  makeWithEffect: _makeWithEffect,
};

export declare namespace Store {
  /** Structural shape of a synchronous store. */
  export type Shape<S, Msg> = StoreShape<S, Msg>;
  /** Structural shape of an effectful store; adds error channel `E` and requirements `R`. */
  export type Effectful<S, Msg, E = never, R = never> = EffectfulStoreShape<S, Msg, E, R>;
}
