[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [web/src](../README.md) / LLMChunk

# Interface: LLMChunk

Defined in: [web/src/stream/llm-chunks.ts:23](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/web/src/stream/llm-chunks.ts#L23)

One normalised chunk delivered by [LLMAdapter](../namespaces/LLMAdapter/README.md). `partial` flags
streaming deltas that will be superseded by a later, finalised chunk.

## Properties

### content?

> `readonly` `optional` **content?**: `string`

Defined in: [web/src/stream/llm-chunks.ts:29](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/web/src/stream/llm-chunks.ts#L29)

Text content (for `text` and tool-call deltas).

***

### partial

> `readonly` **partial**: `boolean`

Defined in: [web/src/stream/llm-chunks.ts:27](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/web/src/stream/llm-chunks.ts#L27)

Whether this chunk is incremental (more is coming).

***

### toolArgs?

> `readonly` `optional` **toolArgs?**: `unknown`

Defined in: [web/src/stream/llm-chunks.ts:33](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/web/src/stream/llm-chunks.ts#L33)

Parsed tool arguments (populated on `tool-call-end`).

***

### toolName?

> `readonly` `optional` **toolName?**: `string`

Defined in: [web/src/stream/llm-chunks.ts:31](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/web/src/stream/llm-chunks.ts#L31)

Tool name for tool-call chunks.

***

### type

> `readonly` **type**: [`LLMChunkType`](../type-aliases/LLMChunkType.md)

Defined in: [web/src/stream/llm-chunks.ts:25](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/web/src/stream/llm-chunks.ts#L25)

Kind of chunk.
