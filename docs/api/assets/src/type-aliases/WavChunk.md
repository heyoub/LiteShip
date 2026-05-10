[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [assets/src](../README.md) / WavChunk

# Type Alias: WavChunk

> **WavChunk** = \{ `formType`: [`FourCC`](FourCC.md); `id`: `"RIFF"`; `offset`: `number`; `size`: `number`; \} \| \{ `data`: `DataView`; `id`: `"LIST"`; `listType`: [`FourCC`](FourCC.md); `offset`: `number`; `size`: `number`; \} \| \{ `data`: `DataView`; `id`: [`FourCC`](FourCC.md); `offset`: `number`; `size`: `number`; \}

Defined in: assets/src/decoders/riff.ts:18

Single yielded chunk from [walkRiff](../functions/walkRiff.md).
