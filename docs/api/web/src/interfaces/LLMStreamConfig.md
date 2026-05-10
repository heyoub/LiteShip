[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [web/src](../README.md) / LLMStreamConfig

# Interface: LLMStreamConfig

Defined in: [web/src/stream/llm-adapter.ts:41](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/web/src/stream/llm-adapter.ts#L41)

Configuration accepted by [LLMAdapter.create](../variables/LLMAdapter.md#create).

`source` is typically the `messages` stream of an [SSE](../variables/SSE.md) client,
but any `Stream.Stream<SSEMessage>` will do -- including mock streams
in tests.

## Properties

### parser

> `readonly` **parser**: [`ChunkParser`](../type-aliases/ChunkParser.md)

Defined in: [web/src/stream/llm-adapter.ts:45](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/web/src/stream/llm-adapter.ts#L45)

Parser mapping SSE messages to typed LLM chunks.

***

### source

> `readonly` **source**: `Stream`\<[`SSEMessage`](../type-aliases/SSEMessage.md)\>

Defined in: [web/src/stream/llm-adapter.ts:43](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/web/src/stream/llm-adapter.ts#L43)

Stream of parsed SSE messages.
