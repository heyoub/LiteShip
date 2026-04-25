[**czap**](../../../README.md)

***

[czap](../../../README.md) / [web/src](../README.md) / ToolCallAccumulator

# Type Alias: ToolCallAccumulator

> **ToolCallAccumulator** = \{ `argFragments`: `string`[]; `name`: `string`; \} \| `null`

Defined in: [web/src/stream/llm-chunks.ts:41](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/web/src/stream/llm-chunks.ts#L41)

Per-stream scratch state used to accumulate tool-call argument
fragments into a single JSON payload at `tool-call-end` time.
`null` means "no tool call in flight."
