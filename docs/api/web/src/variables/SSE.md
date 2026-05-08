[**czap**](../../../README.md)

***

[czap](../../../README.md) / [web/src](../README.md) / SSE

# Variable: SSE

> `const` **SSE**: `object`

Defined in: [web/src/stream/sse.ts:274](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/web/src/stream/sse.ts#L274)

SSE client namespace.

Creates and manages Server-Sent Events connections with automatic
exponential-backoff reconnection, heartbeat timeout detection,
backpressure-aware message buffering via bounded Effect queues,
and URL construction helpers.

## Type Declaration

### buildUrl

> **buildUrl**: (`baseUrl`, `artifactId?`, `lastEventId?`) => `string`

Re-export of the SSE URL-builder (appends `artifactId` + cursor params).

Build an SSE endpoint URL with optional artifact ID and lastEventId.

#### Parameters

##### baseUrl

`string`

##### artifactId?

`string`

##### lastEventId?

`string`

#### Returns

`string`

### calculateDelay

> **calculateDelay**: (`attempt`, `config`) => `number`

Re-export of the exponential-backoff delay calculator.

Calculate reconnection delay using exponential backoff with jitter.

#### Parameters

##### attempt

`number`

##### config

[`ReconnectConfig`](../interfaces/ReconnectConfig.md)

#### Returns

`number`

### create

> **create**: (`config`) => `Effect`\<[`SSEClient`](../interfaces/SSEClient.md), `never`, [`Scope`](#)\>

Create an SSE client that manages a Server-Sent Events connection with
automatic reconnection, heartbeat timeout tracking, and backpressure-aware
message buffering.

**Preflight is mandatory and cannot be disabled.** Every incoming message
is pre-screened by a fast first-character check before `JSON.parse` is
attempted. Non-JSON payloads (plain text, numeric strings, empty strings)
are dropped without entering the try/catch path. This defence-in-depth
guard is always-on; there is no configuration knob to bypass it.
See the red-team regression suite (`tests/regression/`) for the injection
scenarios that motivated this constraint.

#### Parameters

##### config

[`SSEConfig`](../interfaces/SSEConfig.md)

SSE connection configuration

#### Returns

`Effect`\<[`SSEClient`](../interfaces/SSEClient.md), `never`, [`Scope`](#)\>

An Effect yielding an [SSEClient](../interfaces/SSEClient.md) (scoped)

#### Example

```ts
import { SSE } from '@czap/web';
import { Effect, Stream, Scope } from 'effect';

const program = Effect.scoped(Effect.gen(function* () {
  const client = yield* SSE.create({
    url: '/api/stream',
    artifactId: 'doc-1',
  });
  yield* Stream.runForEach(client.messages, (msg) =>
    Effect.sync(() => console.log(msg)),
  );
}));
```

### parseMessage

> **parseMessage**: (`event`) => [`SSEMessage`](../type-aliases/SSEMessage.md) \| `null`

Re-export of the pure SSE line-parser.

Parse an SSE MessageEvent into a typed SSEMessage.
Returns null if the event data is not valid JSON or lacks a type field.

Preflight is mandatory and unconditional: a fast first-character scan
runs before `JSON.parse` on every string payload. Only strings that start
with `{` or `[` (after leading whitespace) proceed to parse; all other
inputs are rejected immediately. This avoids the ~15us try/catch cost on
obviously non-JSON strings and closes the injection vector where a server
sends plain-text or numeric data that could trigger unexpected parse paths.
There is intentionally no opt-out — see red-team regression suite.

#### Parameters

##### event

`MessageEvent`

#### Returns

[`SSEMessage`](../type-aliases/SSEMessage.md) \| `null`

## Example

```ts
import { SSE } from '@czap/web';
import { Effect, Stream } from 'effect';

const program = Effect.scoped(Effect.gen(function* () {
  const client = yield* SSE.create({ url: '/api/events' });
  const state = yield* client.state; // 'connecting' | 'connected' | ...
  yield* Stream.runForEach(
    Stream.take(client.messages, 10),
    (msg) => Effect.sync(() => console.log(msg.type)),
  );
  yield* client.close();
}));
```
