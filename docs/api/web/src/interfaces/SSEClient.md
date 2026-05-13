[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [web/src](../README.md) / SSEClient

# Interface: SSEClient

Defined in: [web/src/stream/sse.ts:21](https://github.com/heyoub/LiteShip/blob/main/packages/web/src/stream/sse.ts#L21)

SSE client instance.

## Properties

### backpressure

> `readonly` **backpressure**: `Effect`\<[`BackpressureHint`](BackpressureHint.md)\>

Defined in: [web/src/stream/sse.ts:27](https://github.com/heyoub/LiteShip/blob/main/packages/web/src/stream/sse.ts#L27)

***

### lastEventId

> `readonly` **lastEventId**: `Effect`\<`string` \| `null`\>

Defined in: [web/src/stream/sse.ts:26](https://github.com/heyoub/LiteShip/blob/main/packages/web/src/stream/sse.ts#L26)

***

### messages

> `readonly` **messages**: `Stream`\<[`SSEMessage`](../type-aliases/SSEMessage.md)\>

Defined in: [web/src/stream/sse.ts:22](https://github.com/heyoub/LiteShip/blob/main/packages/web/src/stream/sse.ts#L22)

***

### state

> `readonly` **state**: `Effect`\<[`SSEState`](../type-aliases/SSEState.md)\>

Defined in: [web/src/stream/sse.ts:23](https://github.com/heyoub/LiteShip/blob/main/packages/web/src/stream/sse.ts#L23)

## Methods

### close()

> **close**(): `Effect`\<`void`\>

Defined in: [web/src/stream/sse.ts:24](https://github.com/heyoub/LiteShip/blob/main/packages/web/src/stream/sse.ts#L24)

#### Returns

`Effect`\<`void`\>

***

### reconnect()

> **reconnect**(): `Effect`\<`void`\>

Defined in: [web/src/stream/sse.ts:25](https://github.com/heyoub/LiteShip/blob/main/packages/web/src/stream/sse.ts#L25)

#### Returns

`Effect`\<`void`\>
