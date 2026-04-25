/**
 * Store -- TEA-style reducer store: make, dispatch, get, changes, effectful reducer.
 */

import { describe, test, expect } from 'vitest';
import { Effect, Stream, Fiber } from 'effect';
import { Store } from '@czap/core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const run = <A>(effect: Effect.Effect<A>): Promise<A> => Effect.runPromise(effect);

type CountMsg = { type: 'increment' } | { type: 'decrement' } | { type: 'set'; value: number };

const countReducer = (state: number, msg: CountMsg): number => {
  switch (msg.type) {
    case 'increment':
      return state + 1;
    case 'decrement':
      return state - 1;
    case 'set':
      return msg.value;
  }
};

// ---------------------------------------------------------------------------
// Store.make (pure reducer)
// ---------------------------------------------------------------------------

describe('Store.make', () => {
  test('_tag is Store', async () => {
    const store = await run(Store.make(0, countReducer));
    expect(store._tag).toBe('Store');
  });

  test('initial state is accessible via get', async () => {
    const store = await run(Store.make(42, countReducer));
    const value = await run(store.get);
    expect(value).toBe(42);
  });

  test('dispatch increment updates state', async () => {
    const store = await run(Store.make(0, countReducer));
    await run(store.dispatch({ type: 'increment' }));
    const value = await run(store.get);
    expect(value).toBe(1);
  });

  test('dispatch decrement updates state', async () => {
    const store = await run(Store.make(10, countReducer));
    await run(store.dispatch({ type: 'decrement' }));
    const value = await run(store.get);
    expect(value).toBe(9);
  });

  test('dispatch set replaces state', async () => {
    const store = await run(Store.make(0, countReducer));
    await run(store.dispatch({ type: 'set', value: 99 }));
    const value = await run(store.get);
    expect(value).toBe(99);
  });

  test('multiple dispatches accumulate', async () => {
    const store = await run(Store.make(0, countReducer));
    await run(store.dispatch({ type: 'increment' }));
    await run(store.dispatch({ type: 'increment' }));
    await run(store.dispatch({ type: 'increment' }));
    await run(store.dispatch({ type: 'decrement' }));
    const value = await run(store.get);
    expect(value).toBe(2);
  });

  test('changes stream emits updates', async () => {
    // SubscriptionRef.changes emits current value first, then subsequent updates
    const collected = await run(
      Effect.gen(function* () {
        const store = yield* Store.make(0, countReducer);
        const fiber = yield* Effect.forkChild(Stream.runCollect(Stream.take(store.changes, 4)));
        yield* Effect.sleep('1 millis');
        yield* store.dispatch({ type: 'increment' });
        yield* store.dispatch({ type: 'increment' });
        yield* store.dispatch({ type: 'set', value: 50 });
        const chunk = yield* Fiber.join(fiber);
        return Array.from(chunk);
      }),
    );
    // First element is initial state (0), then dispatched updates
    expect(collected).toEqual([0, 1, 2, 50]);
  });

  test('works with object state', async () => {
    type AppState = { count: number; label: string };
    type AppMsg = { type: 'rename'; label: string } | { type: 'bump' };
    const reducer = (s: AppState, m: AppMsg): AppState => {
      switch (m.type) {
        case 'rename':
          return { ...s, label: m.label };
        case 'bump':
          return { ...s, count: s.count + 1 };
      }
    };
    const store = await run(Store.make({ count: 0, label: 'hello' }, reducer));
    await run(store.dispatch({ type: 'bump' }));
    await run(store.dispatch({ type: 'rename', label: 'world' }));
    const value = await run(store.get);
    expect(value).toEqual({ count: 1, label: 'world' });
  });
});

// ---------------------------------------------------------------------------
// Store.makeWithEffect (effectful reducer)
// ---------------------------------------------------------------------------

describe('Store.makeWithEffect', () => {
  test('_tag is Store', async () => {
    const store = await run(Store.makeWithEffect(0, (s: number, _msg: string) => Effect.succeed(s)));
    expect(store._tag).toBe('Store');
  });

  test('effectful reducer can transform state', async () => {
    const store = await run(
      Store.makeWithEffect([] as readonly string[], (state: readonly string[], msg: string) =>
        Effect.succeed([...state, msg.toUpperCase()]),
      ),
    );
    await run(store.dispatch('hello'));
    await run(store.dispatch('world'));
    const value = await run(store.get);
    expect(value).toEqual(['HELLO', 'WORLD']);
  });

  test('effectful reducer serializes concurrent dispatches via mutex', async () => {
    const callOrder: number[] = [];
    let callIndex = 0;
    const store = await run(
      Store.makeWithEffect(0, (state: number, msg: number) =>
        Effect.gen(function* () {
          const idx = callIndex++;
          yield* Effect.sleep('1 millis');
          callOrder.push(idx);
          return state + msg;
        }),
      ),
    );
    await run(Effect.all([store.dispatch(1), store.dispatch(2), store.dispatch(3)], { concurrency: 'unbounded' }));
    const value = await run(store.get);
    expect(value).toBe(6);
    // Mutex ensures sequential execution (each completes before next starts)
    expect(callOrder).toEqual([0, 1, 2]);
  });

  test('effectful reducer error propagates', async () => {
    const store = await run(
      Store.makeWithEffect(0, (_state: number, msg: string) =>
        msg === 'fail' ? Effect.fail(new Error('boom')) : Effect.succeed(42),
      ),
    );
    const result = await Effect.runPromiseExit(store.dispatch('fail'));
    expect(result._tag).toBe('Failure');
  });

  test('changes stream emits on effectful dispatch', async () => {
    const collected = await run(
      Effect.gen(function* () {
        const store = yield* Store.makeWithEffect('init', (_state: string, msg: string) => Effect.succeed(msg));
        const fiber = yield* Effect.forkChild(Stream.runCollect(Stream.take(store.changes, 3)));
        yield* Effect.sleep('1 millis');
        yield* store.dispatch('alpha');
        yield* store.dispatch('beta');
        const chunk = yield* Fiber.join(fiber);
        return Array.from(chunk);
      }),
    );
    // First element is initial state, then dispatched updates
    expect(collected).toEqual(['init', 'alpha', 'beta']);
  });
});
