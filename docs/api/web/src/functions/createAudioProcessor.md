[**czap**](../../../README.md)

***

[czap](../../../README.md) / [web/src](../README.md) / createAudioProcessor

# Function: createAudioProcessor()

> **createAudioProcessor**(`context`, `bridge`): `Promise`\<[`AudioProcessor`](../interfaces/AudioProcessor.md)\>

Defined in: [web/src/audio/processor-bootstrap.ts:70](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/web/src/audio/processor-bootstrap.ts#L70)

Register the inline AV-sync worklet module against `context` and mint
a connected [AudioProcessor](../interfaces/AudioProcessor.md). Resolves once the worklet module
is installed; the caller is responsible for connecting `node.node`
into the audio graph.

## Parameters

### context

`AudioContext`

The target `AudioContext`.

### bridge

`AVBridgeShape`

Shared AV bridge the worklet will mutate 128 samples
  at a time.

## Returns

`Promise`\<[`AudioProcessor`](../interfaces/AudioProcessor.md)\>
