[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [assets/src](../README.md) / audioDecoder

# Function: audioDecoder()

> **audioDecoder**(`bytes`): `Promise`\<[`DecodedAudio`](../interfaces/DecodedAudio.md)\>

Defined in: [assets/src/decoders/audio.ts:31](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/assets/src/decoders/audio.ts#L31)

Parse a WAV via RIFF chunk walker and return metadata + sample view.

## Parameters

### bytes

`ArrayBuffer`

## Returns

`Promise`\<[`DecodedAudio`](../interfaces/DecodedAudio.md)\>
