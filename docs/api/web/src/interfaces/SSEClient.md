[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [web/src](../README.md) / SSEClient

# Interface: SSEClient

Defined in: web/src/stream/sse.ts:21

SSE client instance.

## Properties

### backpressure

> `readonly` **backpressure**: `Effect`\<[`BackpressureHint`](BackpressureHint.md)\>

Defined in: web/src/stream/sse.ts:27

***

### lastEventId

> `readonly` **lastEventId**: `Effect`\<`string` \| `null`\>

Defined in: web/src/stream/sse.ts:26

***

### messages

> `readonly` **messages**: `Stream`\<[`SSEMessage`](../type-aliases/SSEMessage.md)\>

Defined in: web/src/stream/sse.ts:22

***

### state

> `readonly` **state**: `Effect`\<[`SSEState`](../type-aliases/SSEState.md)\>

Defined in: web/src/stream/sse.ts:23

## Methods

### close()

> **close**(): `Effect`\<`void`\>

Defined in: web/src/stream/sse.ts:24

#### Returns

`Effect`\<`void`\>

***

### reconnect()

> **reconnect**(): `Effect`\<`void`\>

Defined in: web/src/stream/sse.ts:25

#### Returns

`Effect`\<`void`\>
