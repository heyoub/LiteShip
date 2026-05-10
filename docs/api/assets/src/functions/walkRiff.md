[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [assets/src](../README.md) / walkRiff

# Function: walkRiff()

> **walkRiff**(`buffer`): `Generator`\<[`WavChunk`](../type-aliases/WavChunk.md)\>

Defined in: [assets/src/decoders/riff.ts:48](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/assets/src/decoders/riff.ts#L48)

Iterate over every chunk in a RIFF buffer. The first yielded value is
always the RIFF header; subsequent yields are top-level chunks in the
order they appear. LIST chunks carry their listType so callers can
dispatch (e.g. LIST/INFO for tag metadata).

Throws RangeError if the buffer is too small or a chunk overruns the
buffer; throws Error for non-RIFF magic.

## Parameters

### buffer

`ArrayBuffer`

## Returns

`Generator`\<[`WavChunk`](../type-aliases/WavChunk.md)\>
