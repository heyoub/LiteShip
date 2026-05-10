[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [web/src](../README.md) / ChunkParser

# Type Alias: ChunkParser

> **ChunkParser** = (`event`) => [`LLMChunk`](../interfaces/LLMChunk.md) \| `null`

Defined in: [web/src/stream/llm-adapter.ts:28](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/web/src/stream/llm-adapter.ts#L28)

User-provided function that converts a raw SSE message into an
[LLMChunk](../interfaces/LLMChunk.md) (or `null` to drop it). The adapter calls this
exactly once per incoming message.

## Parameters

### event

[`SSEMessage`](SSEMessage.md)

## Returns

[`LLMChunk`](../interfaces/LLMChunk.md) \| `null`
