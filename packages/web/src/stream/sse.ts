/**
 * SSE Client
 *
 * Manages SSE connection to the server for receiving patches,
 * signals, and events.
 *
 * Internal state is a plain mutable object mutated by a pure-ish reducer;
 * Effect appears only at the Scope boundary (scoped Queue + finalizer) and
 * at the public `state` / `lastEventId` / `backpressure` accessors. See
 * ADR-0005 §Category 4 for the rationale.
 */

import { Effect, Stream, Queue } from 'effect';
import type { Scope } from 'effect';
import { SSE_BUFFER_SIZE, SSE_HEARTBEAT_MS } from '@czap/core';
import type { SSEConfig, SSEState, SSEMessage, BackpressureHint } from '../types.js';

/**
 * SSE client instance.
 */
export interface SSEClient {
  readonly messages: Stream.Stream<SSEMessage>;
  readonly state: Effect.Effect<SSEState>;
  close(): Effect.Effect<void>;
  reconnect(): Effect.Effect<void>;
  readonly lastEventId: Effect.Effect<string | null>;
  readonly backpressure: Effect.Effect<BackpressureHint>;
}

// Import pure functions from sse-pure.ts (Effect-free) and re-export
import {
  defaultReconnectConfig as _defaultReconnectConfig,
  parseMessage as _parseMessage,
  calculateDelay as _calculateDelay,
  buildUrl as _buildUrl,
} from './sse-pure.js';

/** Re-export of the default reconnect policy (see `./sse-pure.js`). */
export const defaultReconnectConfig = _defaultReconnectConfig;
/** Re-export of the pure SSE line-parser. */
export const parseMessage = _parseMessage;
/** Re-export of the exponential-backoff delay calculator. */
export const calculateDelay = _calculateDelay;
/** Re-export of the SSE URL-builder (appends `artifactId` + cursor params). */
export const buildUrl = _buildUrl;

/**
 * Create an SSE client that manages a Server-Sent Events connection with
 * automatic reconnection, heartbeat timeout tracking, and backpressure-aware
 * message buffering.
 *
 * **Preflight is mandatory and cannot be disabled.** Every incoming message
 * is pre-screened by a fast first-character check before `JSON.parse` is
 * attempted. Non-JSON payloads (plain text, numeric strings, empty strings)
 * are dropped without entering the try/catch path. This defence-in-depth
 * guard is always-on; there is no configuration knob to bypass it.
 * See the red-team regression suite (`tests/regression/`) for the injection
 * scenarios that motivated this constraint.
 *
 * @example
 * ```ts
 * import { SSE } from '@czap/web';
 * import { Effect, Stream, Scope } from 'effect';
 *
 * const program = Effect.scoped(Effect.gen(function* () {
 *   const client = yield* SSE.create({
 *     url: '/api/stream',
 *     artifactId: 'doc-1',
 *   });
 *   yield* Stream.runForEach(client.messages, (msg) =>
 *     Effect.sync(() => console.log(msg)),
 *   );
 * }));
 * ```
 *
 * @param config - SSE connection configuration
 * @returns An Effect yielding an {@link SSEClient} (scoped)
 */
export const create = (config: SSEConfig): Effect.Effect<SSEClient, never, Scope.Scope> =>
  Effect.gen(function* () {
    const reconnectConfig = config.reconnect ?? defaultReconnectConfig;
    const heartbeatInterval = config.heartbeatInterval ?? SSE_HEARTBEAT_MS;
    const maxBufferSize = SSE_BUFFER_SIZE;

    // All SSE state lives in one plain object. Transitions are synchronous
    // mutations — Effect only bridges out at the public accessors.
    const machine: {
      status: SSEState;
      lastEventId: string | null;
      source: EventSource | null;
      reconnectAttempt: number;
      bufferSize: number;
      reconnectHandle: ReturnType<typeof setTimeout> | null;
      heartbeatHandle: ReturnType<typeof setTimeout> | null;
    } = {
      status: 'connecting',
      lastEventId: config.lastEventId ?? null,
      source: null,
      reconnectAttempt: 0,
      bufferSize: 0,
      reconnectHandle: null,
      heartbeatHandle: null,
    };

    const messageQueue = yield* Queue.bounded<SSEMessage>(maxBufferSize);

    const clearReconnectHandle = (): void => {
      if (machine.reconnectHandle !== null) {
        clearTimeout(machine.reconnectHandle);
        machine.reconnectHandle = null;
      }
    };

    const clearHeartbeat = (): void => {
      if (machine.heartbeatHandle !== null) {
        clearTimeout(machine.heartbeatHandle);
        machine.heartbeatHandle = null;
      }
    };

    const resetHeartbeat = (): void => {
      clearHeartbeat();
      machine.heartbeatHandle = setTimeout(() => {
        machine.status = 'error';
        const source = machine.source;
        machine.source = null;
        source?.close();
      }, heartbeatInterval * 2);
    };

    const setupSource = (): void => {
      const url = buildUrl(config.url, config.artifactId, machine.lastEventId ?? undefined);
      const source = new EventSource(url);
      machine.source = source;
      resetHeartbeat();

      source.onmessage = (event: MessageEvent) => {
        const message = parseMessage(event);
        if (message) {
          if (event.lastEventId) {
            machine.lastEventId = event.lastEventId;
          }

          machine.status = 'connected';
          machine.reconnectAttempt = 0;

          if (machine.bufferSize < maxBufferSize) {
            machine.bufferSize += 1;
            Queue.offerUnsafe(messageQueue, message);
          }

          resetHeartbeat();
        }
      };

      source.onerror = () => {
        source.close();
        clearHeartbeat();
        machine.source = null;
        machine.status = 'reconnecting';

        const attempt = machine.reconnectAttempt;
        machine.reconnectAttempt = attempt + 1;
        if (attempt < reconnectConfig.maxAttempts) {
          const delay = calculateDelay(attempt, reconnectConfig);
          machine.reconnectHandle = setTimeout(setupSource, delay);
        } else {
          machine.status = 'error';
        }
      };
    };

    const createConnection = Effect.sync(() => {
      setupSource();
    });

    yield* createConnection;

    const messages: Stream.Stream<SSEMessage> = Stream.fromQueue(messageQueue).pipe(
      Stream.tap(() =>
        Effect.sync(() => {
          machine.bufferSize = Math.max(0, machine.bufferSize - 1);
        }),
      ),
    );

    const client: SSEClient = {
      messages,

      state: Effect.sync(() => machine.status),

      lastEventId: Effect.sync(() => machine.lastEventId),

      backpressure: Effect.sync(() => {
        const bufferSize = machine.bufferSize;
        const percentFull = Math.round((bufferSize / maxBufferSize) * 100);
        return {
          bufferSize,
          maxBufferSize,
          percentFull,
          dropping: bufferSize >= maxBufferSize,
        };
      }),

      close: () =>
        Effect.gen(function* () {
          clearReconnectHandle();
          clearHeartbeat();
          const currentSource = machine.source;
          if (currentSource) {
            currentSource.close();
            machine.source = null;
            machine.status = 'disconnected';
          }
          yield* Queue.shutdown(messageQueue);
        }),

      reconnect: () =>
        Effect.gen(function* () {
          clearReconnectHandle();
          clearHeartbeat();
          const currentSource = machine.source;
          if (currentSource) {
            currentSource.close();
            machine.source = null;
          }
          machine.reconnectAttempt = 0;
          machine.status = 'connecting';

          yield* createConnection;
        }),
    };

    yield* Effect.addFinalizer(() =>
      Effect.gen(function* () {
        clearReconnectHandle();
        clearHeartbeat();
        const currentSource = machine.source;
        if (currentSource) {
          currentSource.close();
          machine.source = null;
        }
        yield* Queue.shutdown(messageQueue);
      }),
    );

    return client;
  });

/**
 * SSE client namespace.
 *
 * Creates and manages Server-Sent Events connections with automatic
 * exponential-backoff reconnection, heartbeat timeout detection,
 * backpressure-aware message buffering via bounded Effect queues,
 * and URL construction helpers.
 *
 * @example
 * ```ts
 * import { SSE } from '@czap/web';
 * import { Effect, Stream } from 'effect';
 *
 * const program = Effect.scoped(Effect.gen(function* () {
 *   const client = yield* SSE.create({ url: '/api/events' });
 *   const state = yield* client.state; // 'connecting' | 'connected' | ...
 *   yield* Stream.runForEach(
 *     Stream.take(client.messages, 10),
 *     (msg) => Effect.sync(() => console.log(msg.type)),
 *   );
 *   yield* client.close();
 * }));
 * ```
 */
export const SSE = {
  create,
  parseMessage,
  calculateDelay,
  buildUrl,
} as const;
