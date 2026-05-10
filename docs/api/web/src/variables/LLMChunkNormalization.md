[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [web/src](../README.md) / LLMChunkNormalization

# Variable: LLMChunkNormalization

> `const` **LLMChunkNormalization**: `object`

Defined in: web/src/stream/llm-chunks.ts:126

Pure normalisation helpers for provider-agnostic LLM chunk streams.

`normalize` is the state machine that accumulates tool-call deltas
into a finalised `tool-call-end` chunk; `parseAccumulatedToolArgs`
tries JSON-parsing the concatenated argument fragments and falls
back to the raw string on parse failure.

## Type Declaration

### normalize

> **normalize**: (`chunk`, `toolCallBuffer`) => `object`

#### Parameters

##### chunk

[`LLMChunk`](../interfaces/LLMChunk.md)

##### toolCallBuffer

[`ToolCallAccumulator`](../type-aliases/ToolCallAccumulator.md)

#### Returns

`object`

##### chunk

> `readonly` **chunk**: [`LLMChunk`](../interfaces/LLMChunk.md) \| `null`

##### toolCallBuffer

> `readonly` **toolCallBuffer**: [`ToolCallAccumulator`](../type-aliases/ToolCallAccumulator.md)

### parseAccumulatedToolArgs

> **parseAccumulatedToolArgs**: (`toolCallBuffer`) => `unknown`

#### Parameters

##### toolCallBuffer

###### argFragments

`string`[]

###### name

`string`

#### Returns

`unknown`
