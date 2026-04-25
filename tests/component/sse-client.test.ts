/**
 * Component test: SSE client lifecycle.
 *
 * Tests full SSE client with connection management, reconnection,
 * heartbeat timeout, buffer backpressure, and state transitions.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { Effect, Fiber, Ref, Stream } from 'effect';
import { SSE } from '@czap/web';
import type { SSEConfig } from '@czap/web';
import { Millis } from '@czap/core';
import { MockEventSource } from '../helpers/mock-event-source.js';
import { runScopedAsync as runScoped } from '../helpers/effect-test.js';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let restoreES: () => void;

beforeEach(() => {
  vi.useFakeTimers();
  restoreES = MockEventSource.install();
});

afterEach(() => {
  restoreES();
  vi.useRealTimers();
});

const baseConfig: SSEConfig = {
  url: 'http://localhost/sse',
  heartbeatInterval: Millis(5000),
  reconnect: {
    maxAttempts: 3,
    initialDelay: Millis(100),
    maxDelay: Millis(1000),
    factor: 2,
  },
};

// ---------------------------------------------------------------------------
// Connection lifecycle
// ---------------------------------------------------------------------------

describe('SSE client lifecycle', () => {
  test('creates EventSource on init', async () => {
    await runScoped(
      Effect.gen(function* () {
        const client = yield* SSE.create(baseConfig);

        expect(MockEventSource.instances).toHaveLength(1);
        expect(MockEventSource.instances[0]!.url).toContain('localhost/sse');
      }),
    );
  });

  test('initial state is connecting', async () => {
    await runScoped(
      Effect.gen(function* () {
        const client = yield* SSE.create(baseConfig);
        const state = yield* client.state;
        expect(state).toBe('connecting');
      }),
    );
  });

  test('state becomes connected after first message', async () => {
    await runScoped(
      Effect.gen(function* () {
        const client = yield* SSE.create(baseConfig);
        const es = MockEventSource.instances[0]!;

        // Simulate a valid message
        es.simulateMessage(JSON.stringify({ type: 'heartbeat' }));

        const state = yield* client.state;
        expect(state).toBe('connected');
      }),
    );
  });

  test('close shuts down EventSource and state is disconnected', async () => {
    await runScoped(
      Effect.gen(function* () {
        const client = yield* SSE.create(baseConfig);
        const es = MockEventSource.instances[0]!;

        yield* client.close();

        expect(es.readyState).toBe(MockEventSource.CLOSED);
        const state = yield* client.state;
        expect(state).toBe('disconnected');
      }),
    );
  });

  test('invalid messages are ignored without changing connection state', async () => {
    await runScoped(
      Effect.gen(function* () {
        const client = yield* SSE.create(baseConfig);
        const es = MockEventSource.instances[0]!;

        es.simulateMessage('not json');

        const state = yield* client.state;
        expect(state).toBe('connecting');
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Reconnection
// ---------------------------------------------------------------------------

describe('SSE reconnection', () => {
  test('error triggers reconnect with new EventSource', async () => {
    await runScoped(
      Effect.gen(function* () {
        const client = yield* SSE.create(baseConfig);
        const firstES = MockEventSource.instances[0]!;

        // Simulate error
        firstES.simulateError();

        const state = yield* client.state;
        expect(state).toBe('reconnecting');

        // Advance past initial delay
        vi.advanceTimersByTime(150);

        // A new EventSource should have been created
        expect(MockEventSource.instances).toHaveLength(2);
      }),
    );
  });

  test('reconnect delay increases exponentially', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    await runScoped(
      Effect.gen(function* () {
        const client = yield* SSE.create(baseConfig);

        // First error
        MockEventSource.instances[0]!.simulateError();
        vi.advanceTimersByTime(150); // initialDelay=100, factor=2
        expect(MockEventSource.instances).toHaveLength(2);

        // Second error
        MockEventSource.instances[1]!.simulateError();
        vi.advanceTimersByTime(150); // Should NOT be enough (delay ~200)
        expect(MockEventSource.instances).toHaveLength(2);

        vi.advanceTimersByTime(100); // Now at ~250ms total, past 200ms delay
        expect(MockEventSource.instances).toHaveLength(3);
      }),
    );
  });

  test('max attempts reached sets state to error', async () => {
    await runScoped(
      Effect.gen(function* () {
        const client = yield* SSE.create(baseConfig);

        // Exhaust all 3 reconnect attempts
        for (let i = 0; i < 3; i++) {
          const es = MockEventSource.instances[MockEventSource.instances.length - 1]!;
          es.simulateError();
          vi.advanceTimersByTime(2000); // Plenty of time for any backoff
        }

        // One more error after max attempts
        const lastES = MockEventSource.instances[MockEventSource.instances.length - 1]!;
        lastES.simulateError();

        const state = yield* client.state;
        expect(state).toBe('error');
      }),
    );
  });

  test('manual reconnect resets attempt counter', async () => {
    await runScoped(
      Effect.gen(function* () {
        const client = yield* SSE.create(baseConfig);
        const es = MockEventSource.instances[0]!;

        // Trigger an error
        es.simulateError();
        vi.advanceTimersByTime(200);

        const countBefore = MockEventSource.instances.length;

        // Manual reconnect
        yield* client.reconnect();

        // Should have created a new EventSource
        expect(MockEventSource.instances.length).toBe(countBefore + 1);

        const state = yield* client.state;
        expect(state).toBe('connecting');
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Heartbeat timeout
// ---------------------------------------------------------------------------

describe('SSE heartbeat', () => {
  test('heartbeat timeout triggers close after 2x interval', async () => {
    await runScoped(
      Effect.gen(function* () {
        const client = yield* SSE.create(baseConfig);
        const es = MockEventSource.instances[0]!;

        // No messages for heartbeatInterval * 2 = 10000ms
        vi.advanceTimersByTime(10_100);

        const state = yield* client.state;
        expect(state).toBe('error');
      }),
    );
  });

  test('messages reset heartbeat timer', async () => {
    await runScoped(
      Effect.gen(function* () {
        const client = yield* SSE.create(baseConfig);
        const es = MockEventSource.instances[0]!;

        // Send a message at 4s (before 10s timeout)
        vi.advanceTimersByTime(4000);
        es.simulateMessage(JSON.stringify({ type: 'heartbeat' }));

        // Advance another 4s (total 8s from message, still before 10s)
        vi.advanceTimersByTime(4000);

        const state = yield* client.state;
        expect(state).toBe('connected');
      }),
    );
  });

  test('close is a no-op when the heartbeat timeout already cleared the source', async () => {
    await runScoped(
      Effect.gen(function* () {
        const client = yield* SSE.create(baseConfig);

        vi.advanceTimersByTime(10_100);
        yield* client.close();

        const state = yield* client.state;
        expect(state).toBe('error');
      }),
    );
  });

  test('reconnect recreates the source after heartbeat timeout cleared it', async () => {
    await runScoped(
      Effect.gen(function* () {
        const client = yield* SSE.create(baseConfig);

        vi.advanceTimersByTime(10_100);
        const countBefore = MockEventSource.instances.length;

        yield* client.reconnect();

        expect(MockEventSource.instances.length).toBe(countBefore + 1);
        const state = yield* client.state;
        expect(state).toBe('connecting');
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Last Event ID
// ---------------------------------------------------------------------------

describe('SSE lastEventId', () => {
  test('tracks lastEventId from messages', async () => {
    await runScoped(
      Effect.gen(function* () {
        const client = yield* SSE.create(baseConfig);
        const es = MockEventSource.instances[0]!;

        es.simulateMessage(JSON.stringify({ type: 'patch', data: {} }), 'evt-42');

        const lastId = yield* client.lastEventId;
        expect(lastId).toBe('evt-42');
      }),
    );
  });

  test('lastEventId is null initially', async () => {
    await runScoped(
      Effect.gen(function* () {
        const client = yield* SSE.create(baseConfig);
        const lastId = yield* client.lastEventId;
        expect(lastId).toBeNull();
      }),
    );
  });
});
// Backpressure
// ---------------------------------------------------------------------------

describe('SSE backpressure', () => {
  test('reports buffer usage', async () => {
    await runScoped(
      Effect.gen(function* () {
        const client = yield* SSE.create(baseConfig);
        const es = MockEventSource.instances[0]!;

        // Send some messages
        for (let i = 0; i < 5; i++) {
          es.simulateMessage(JSON.stringify({ type: 'patch', data: { i } }));
        }

        const bp = yield* client.backpressure;
        expect(bp.bufferSize).toBe(5);
        expect(bp.maxBufferSize).toBe(100);
        expect(bp.percentFull).toBe(5);
        expect(bp.dropping).toBe(false);
      }),
    );
  });

  test('drops messages when buffer is full', async () => {
    await runScoped(
      Effect.gen(function* () {
        const client = yield* SSE.create(baseConfig);
        const es = MockEventSource.instances[0]!;

        // Fill the buffer to capacity (100) and then some
        for (let i = 0; i < 105; i++) {
          es.simulateMessage(JSON.stringify({ type: 'patch', data: { i } }));
        }

        const bp = yield* client.backpressure;
        expect(bp.bufferSize).toBe(100);
        expect(bp.dropping).toBe(true);
        expect(bp.percentFull).toBe(100);
      }),
    );
  });

  test('consuming messages drains the buffer accounting through the stream tap', async () => {
    vi.useRealTimers();
    try {
      await runScoped(
        Effect.gen(function* () {
          const client = yield* SSE.create(baseConfig);
          const es = MockEventSource.instances[0]!;
          const fiber = yield* Effect.forkScoped(Stream.runCollect(Stream.take(client.messages, 2)));
          yield* Effect.promise(() => Promise.resolve());

          es.simulateMessage(JSON.stringify({ type: 'patch', data: { i: 1 } }));
          es.simulateMessage(JSON.stringify({ type: 'patch', data: { i: 2 } }));
          yield* Effect.promise(() => Promise.resolve());

          const messages = Array.from(yield* Fiber.join(fiber));
          expect(messages).toHaveLength(2);

          const bp = yield* client.backpressure;
          expect(bp.bufferSize).toBe(0);
          expect(bp.percentFull).toBe(0);
        }),
      );
    } finally {
      vi.useFakeTimers();
    }
  });
});

describe('SSE initial lastEventId config', () => {
  test('uses lastEventId from config when provided', async () => {
    await runScoped(
      Effect.gen(function* () {
        const client = yield* SSE.create({ ...baseConfig, lastEventId: 'evt-99' });
        const lastId = yield* client.lastEventId;
        expect(lastId).toBe('evt-99');
      }),
    );
  });

  test('message without lastEventId does not overwrite existing value', async () => {
    await runScoped(
      Effect.gen(function* () {
        const client = yield* SSE.create({ ...baseConfig, lastEventId: 'evt-50' });
        const es = MockEventSource.instances[0]!;

        // Message with no lastEventId
        es.simulateMessage(JSON.stringify({ type: 'heartbeat' }));

        const lastId = yield* client.lastEventId;
        expect(lastId).toBe('evt-50');
      }),
    );
  });

  test('uses default reconnect config when none provided', async () => {
    await runScoped(
      Effect.gen(function* () {
        const client = yield* SSE.create({ url: 'http://localhost/sse' });
        const state = yield* client.state;
        expect(state).toBe('connecting');
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Pure helpers (already tested in unit, but verify wiring)
// ---------------------------------------------------------------------------

describe('SSE pure helpers', () => {
  test('buildUrl adds artifactId', () => {
    const url = SSE.buildUrl('http://localhost/sse', 'abc123');
    expect(url).toContain('/abc123');
  });

  test('buildUrl adds lastEventId as query param', () => {
    const url = SSE.buildUrl('http://localhost/sse', undefined, 'evt-5');
    expect(url).toContain('lastEventId=evt-5');
  });

  test('calculateDelay respects maxDelay', () => {
    const delay = SSE.calculateDelay(100, {
      maxAttempts: 10,
      initialDelay: Millis(100),
      maxDelay: Millis(500),
      factor: 2,
    });
    expect(delay).toBeLessThanOrEqual(500);
  });
});

// ---------------------------------------------------------------------------
// Scope finalizer
// ---------------------------------------------------------------------------

describe('SSE scope cleanup', () => {
  test('scope close shuts down EventSource', async () => {
    // Run the scoped effect — when it completes, the scope closes
    // and the finalizer should clean up the EventSource
    await runScoped(
      Effect.gen(function* () {
        const client = yield* SSE.create(baseConfig);

        const es = MockEventSource.instances[0]!;
        expect(es.readyState).not.toBe(MockEventSource.CLOSED);
        // Scope will close after this gen completes
      }),
    );

    // After scope closes, EventSource should be cleaned up
    const es = MockEventSource.instances[0]!;
    expect(es.readyState).toBe(MockEventSource.CLOSED);
  });
});
