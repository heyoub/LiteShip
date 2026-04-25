/**
 * Component test: Wire stream composition.
 *
 * Tests Wire.fromSSE, Wire.fromWebSocket, and all stream operators
 * using MockEventSource and MockWebSocket.
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { Effect, Stream, Queue, Scope } from 'effect';
import { Millis, Wire } from '@czap/core';
import { MockEventSource } from '../helpers/mock-event-source.js';
import { MockWebSocket } from '../helpers/mock-websocket.js';

// ---------------------------------------------------------------------------
// Setup/teardown
// ---------------------------------------------------------------------------

let restoreEventSource: () => void;
let restoreWebSocket: () => void;

beforeEach(() => {
  restoreEventSource = MockEventSource.install();
  restoreWebSocket = MockWebSocket.install();
});

afterEach(() => {
  restoreEventSource();
  restoreWebSocket();
});

// ---------------------------------------------------------------------------
// Wire.from -- basic stream wrapping
// ---------------------------------------------------------------------------

describe('Wire.from', () => {
  test('wraps a plain Effect stream', () => {
    const wire = Wire.from(Stream.make(1, 2, 3));
    const result = Effect.runSync(wire.runCollect());
    expect(result).toEqual([1, 2, 3]);
  });

  test('wire.map transforms values', () => {
    const wire = Wire.from(Stream.make(1, 2, 3)).map((x) => x * 10);
    const result = Effect.runSync(wire.runCollect());
    expect(result).toEqual([10, 20, 30]);
  });

  test('wire.filter removes values', () => {
    const wire = Wire.from(Stream.make(1, 2, 3, 4, 5)).filter((x) => x % 2 === 0);
    const result = Effect.runSync(wire.runCollect());
    expect(result).toEqual([2, 4]);
  });

  test('wire.take limits items', () => {
    const wire = Wire.from(Stream.make(1, 2, 3, 4, 5)).take(3);
    const result = Effect.runSync(wire.runCollect());
    expect(result).toEqual([1, 2, 3]);
  });

  test('wire.takeUntil stops at predicate', () => {
    const wire = Wire.from(Stream.make(1, 2, 3, 4, 5)).takeUntil((x) => x === 3);
    const result = Effect.runSync(wire.runCollect());
    expect(result).toEqual([1, 2, 3]);
  });

  test('wire.debounce returns a usable wire and flushes the trailing value', async () => {
    const wire = Wire.from(Stream.make(1, 2, 3)).debounce(Millis(1));
    const result = await Effect.runPromise(wire.runCollect());
    expect(result.at(-1)).toBe(3);
  });

  test('wire.throttle returns a usable wire and eventually emits values', async () => {
    const wire = Wire.from(Stream.make(1, 2, 3)).throttle(Millis(1));
    const result = await Effect.runPromise(wire.runCollect());
    expect(result).toEqual([1, 2, 3]);
  });

  test('wire.scan accumulates', () => {
    const wire = Wire.from(Stream.make(1, 2, 3)).scan(0, (acc, x) => acc + x);
    const result = Effect.runSync(wire.runCollect());
    // Stream.scan includes the running accumulator after each element
    expect(result).toEqual([0, 1, 3, 6]);
  });

  test('wire.flatMap chains', () => {
    const wire = Wire.from(Stream.make(1, 2)).flatMap((x) => Wire.from(Stream.make(x, x * 10)));
    const result = Effect.runSync(wire.runCollect());
    expect(result).toEqual([1, 10, 2, 20]);
  });

  test('wire.merge interleaves', async () => {
    const a = Wire.from(Stream.make(1, 2));
    const b = Wire.from(Stream.make(3, 4));
    const merged = a.merge(b);
    const result = await Effect.runPromise(merged.runCollect());
    expect(result.sort()).toEqual([1, 2, 3, 4]);
  });

  test('wire.run drains without collecting', () => {
    const wire = Wire.from(Stream.make(1, 2, 3));
    Effect.runSync(wire.run());
    // No error = success
  });
});

// ---------------------------------------------------------------------------
// Wire.zip
// ---------------------------------------------------------------------------

describe('Wire.zip', () => {
  test('pairs elements from two wires', () => {
    const a = Wire.from(Stream.make('a', 'b'));
    const b = Wire.from(Stream.make(1, 2));
    const zipped = Wire.zip(a, b);
    const result = Effect.runSync(zipped.runCollect());
    expect(result).toEqual([
      ['a', 1],
      ['b', 2],
    ]);
  });
});

// ---------------------------------------------------------------------------
// Wire.merge (static)
// ---------------------------------------------------------------------------

describe('Wire.merge', () => {
  test('merges multiple wires', async () => {
    const wires = [Wire.from(Stream.make(1)), Wire.from(Stream.make(2)), Wire.from(Stream.make(3))];
    const merged = Wire.merge(wires);
    const result = await Effect.runPromise(Wire.runCollect(merged));
    expect(Array.from(result).sort()).toEqual([1, 2, 3]);
  });
});

// ---------------------------------------------------------------------------
// Wire.runForEach
// ---------------------------------------------------------------------------

describe('Wire.runForEach', () => {
  test('invokes callback for each item', () => {
    const collected: number[] = [];
    const wire = Wire.from(Stream.make(10, 20, 30));
    Effect.runSync(
      Wire.runForEach(wire, (x) =>
        Effect.sync(() => {
          collected.push(x);
        }),
      ),
    );
    expect(collected).toEqual([10, 20, 30]);
  });
});

// ---------------------------------------------------------------------------
// Wire.fromSSE
// ---------------------------------------------------------------------------

describe('Wire.fromSSE', () => {
  test('creates EventSource and receives messages', async () => {
    const wire = Wire.fromSSE('http://localhost/events');

    // Start collecting in background; take first 2 messages
    const collectPromise = Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const items = yield* wire.take(2).runCollect();
          return items;
        }),
      ),
    );

    // Give Effect runtime a microtask to set up the EventSource
    await new Promise((r) => setTimeout(r, 10));

    const es = MockEventSource.instances[0];
    expect(es).toBeDefined();
    expect(es!.url).toBe('http://localhost/events');

    es!.simulateMessage('hello');
    es!.simulateMessage('world');

    const result = await collectPromise;
    expect(result).toHaveLength(2);
    expect(result[0].data).toBe('hello');
    expect(result[1].data).toBe('world');
  });

  test('error closes EventSource', async () => {
    const wire = Wire.fromSSE('http://localhost/events');

    // When EventSource errors, the stream shuts down via Queue.shutdown
    // which may cause an interrupt. We just verify the EventSource gets closed.
    const collectPromise = Effect.runPromise(Effect.scoped(wire.take(1).runCollect())).catch(
      () => [] as MessageEvent[],
    );

    await new Promise((r) => setTimeout(r, 10));

    const es = MockEventSource.instances[0];
    expect(es).toBeDefined();
    es!.simulateError();

    await collectPromise;
    expect(es!.readyState).toBe(MockEventSource.CLOSED);
  });
});

// ---------------------------------------------------------------------------
// Wire.fromWebSocket
// ---------------------------------------------------------------------------

describe('Wire.fromWebSocket', () => {
  test('creates WebSocket and receives messages', async () => {
    const wire = Wire.fromWebSocket('ws://localhost/ws');

    const collectPromise = Effect.runPromise(Effect.scoped(wire.take(2).runCollect()));

    await new Promise((r) => setTimeout(r, 10));

    const ws = MockWebSocket.instances[0];
    expect(ws).toBeDefined();
    expect(ws!.url).toBe('ws://localhost/ws');

    ws!.simulateOpen();
    ws!.simulateMessage('msg1');
    ws!.simulateMessage('msg2');

    const result = await collectPromise;
    expect(result).toHaveLength(2);
    expect(result[0].data).toBe('msg1');
    expect(result[1].data).toBe('msg2');
  });

  test('close event shuts down stream', async () => {
    const wire = Wire.fromWebSocket('ws://localhost/ws');

    const collectPromise = Effect.runPromise(Effect.scoped(wire.take(1).runCollect())).catch(
      () => [] as MessageEvent[],
    );

    await new Promise((r) => setTimeout(r, 10));

    const ws = MockWebSocket.instances[0];
    ws!.simulateOpen();
    ws!.simulateMessage('only-one');

    const result = await collectPromise;
    expect(result).toHaveLength(1);
    expect(result[0].data).toBe('only-one');
  });

  test('error event closes connection', async () => {
    const wire = Wire.fromWebSocket('ws://localhost/ws');

    const collectPromise = Effect.runPromise(Effect.scoped(wire.take(1).runCollect())).catch(
      () => [] as MessageEvent[],
    );

    await new Promise((r) => setTimeout(r, 10));

    const ws = MockWebSocket.instances[0];
    ws!.simulateError();

    const result = await collectPromise;
    expect(result).toEqual([]);
  });

  test('scope finalizer closes WebSocket', async () => {
    const wire = Wire.fromWebSocket('ws://localhost/ws');

    const collectPromise = Effect.runPromise(Effect.scoped(wire.take(1).runCollect()));

    await new Promise((r) => setTimeout(r, 10));

    const ws = MockWebSocket.instances[0]!;
    ws.simulateOpen();
    ws.simulateMessage('msg');

    await collectPromise;

    // After scope closes, WebSocket should be closed
    expect(ws.readyState).toBe(MockWebSocket.CLOSED);
  });

  test('scope finalizer tolerates an already-closed WebSocket', async () => {
    const wire = Wire.fromWebSocket('ws://localhost/ws');

    const collectPromise = Effect.runPromise(Effect.scoped(wire.take(1).runCollect())).catch(
      () => [] as MessageEvent[],
    );

    await new Promise((r) => setTimeout(r, 10));

    const ws = MockWebSocket.instances[0]!;
    ws.simulateClose();

    const result = await collectPromise;
    expect(result).toEqual([]);
    expect(ws.readyState).toBe(MockWebSocket.CLOSED);
  });
});

// ---------------------------------------------------------------------------
// Wire.fromAsyncIterable
// ---------------------------------------------------------------------------

describe('Wire.fromAsyncIterable', () => {
  test('wraps an async iterable', async () => {
    async function* gen() {
      yield 'a';
      yield 'b';
      yield 'c';
    }
    const wire = Wire.fromAsyncIterable(gen());
    const result = await Effect.runPromise(wire.runCollect());
    expect(result).toEqual(['a', 'b', 'c']);
  });

  test('maps async iterable failures into stream errors', async () => {
    async function* gen() {
      yield 'a';
      throw new Error('iterable exploded');
    }

    const wire = Wire.fromAsyncIterable(gen());
    await expect(Effect.runPromise(wire.runCollect())).rejects.toThrow('iterable exploded');
  });

  test('wraps non-Error throws with the Error constructor', async () => {
    async function* gen() {
      yield 'a';
      throw 'string-not-error';
    }

    const wire = Wire.fromAsyncIterable(gen());
    await expect(Effect.runPromise(wire.runCollect())).rejects.toThrow('string-not-error');
  });
});

// ---------------------------------------------------------------------------
// Composition pipeline
// ---------------------------------------------------------------------------

describe('Wire composition pipeline', () => {
  test('map → filter → take → collect', () => {
    const wire = Wire.from(Stream.make(1, 2, 3, 4, 5, 6, 7, 8, 9, 10))
      .map((x) => x * 2)
      .filter((x) => x > 10)
      .take(3);
    const result = Effect.runSync(wire.runCollect());
    expect(result).toEqual([12, 14, 16]);
  });

  test('scan → takeUntil → collect', () => {
    const wire = Wire.from(Stream.make(1, 1, 1, 1, 1, 1))
      .scan(0, (acc, x) => acc + x)
      .takeUntil((sum) => sum >= 4);
    const result = Effect.runSync(wire.runCollect());
    // scan emits: 0, 1, 2, 3, 4, 5, 6 — takeUntil stops at the first >= 4
    expect(result).toEqual([0, 1, 2, 3, 4]);
  });
});
