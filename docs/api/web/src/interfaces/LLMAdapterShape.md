[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [web/src](../README.md) / LLMAdapterShape

# Interface: LLMAdapterShape

Defined in: web/src/stream/llm-adapter.ts:57

Host-facing surface of an LLM adapter. Exposes both the typed
[LLMChunk](LLMChunk.md) stream and the decoded text-token stream derived
from it. Returned by [LLMAdapter.create](../variables/LLMAdapter.md#create).

## Properties

### chunks

> `readonly` **chunks**: `Stream`\<[`LLMChunk`](LLMChunk.md)\>

Defined in: web/src/stream/llm-adapter.ts:58

***

### textTokens

> `readonly` **textTokens**: `Stream`\<`string`\>

Defined in: web/src/stream/llm-adapter.ts:59
