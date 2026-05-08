[**czap**](../../../README.md)

***

[czap](../../../README.md) / [assets/src](../README.md) / extractWavMetadata

# Function: extractWavMetadata()

> **extractWavMetadata**(`bytes`): [`WavMetadata`](../interfaces/WavMetadata.md)

Defined in: [assets/src/analysis/wav-metadata.ts:36](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/assets/src/analysis/wav-metadata.ts#L36)

Walk LIST/INFO sub-chunks and project them onto the canonical
WavMetadata shape. Unknown tags are ignored. Returns an empty object
if the file has no LIST/INFO chunk.

## Parameters

### bytes

`ArrayBuffer`

## Returns

[`WavMetadata`](../interfaces/WavMetadata.md)
