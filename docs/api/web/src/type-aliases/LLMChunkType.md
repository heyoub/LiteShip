[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [web/src](../README.md) / LLMChunkType

# Type Alias: LLMChunkType

> **LLMChunkType** = `"text"` \| `"tool-call-start"` \| `"tool-call-delta"` \| `"tool-call-end"` \| `"done"`

Defined in: [web/src/stream/llm-chunks.ts:17](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/web/src/stream/llm-chunks.ts#L17)

Discriminated kinds of LLM stream chunk:

- `text`: a token or block of model-generated text.
- `tool-call-start` / `...-delta` / `...-end`: progressive delivery
  of a single tool invocation (partial deltas accumulate arguments).
- `done`: terminal sentinel emitted by the provider.
