[**czap**](../../../README.md)

***

[czap](../../../README.md) / [web/src](../README.md) / AudioProcessor

# Interface: AudioProcessor

Defined in: [web/src/audio/processor.ts:27](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/web/src/audio/processor.ts#L27)

Host-side surface of the AV-sync AudioWorklet processor.

The returned `node` should be connected into the host's audio graph;
the accompanying [AudioProcessor.bridge](#bridge) is shared between the
main thread and the worklet so both sides observe the same
sample-accurate clock.

## Properties

### bridge

> `readonly` **bridge**: `AVBridgeShape`

Defined in: [web/src/audio/processor.ts:31](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/web/src/audio/processor.ts#L31)

Shared AV bridge advanced 128 samples per worklet render quantum.

***

### node

> `readonly` **node**: `AudioWorkletNode`

Defined in: [web/src/audio/processor.ts:29](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/web/src/audio/processor.ts#L29)

The underlying `AudioWorkletNode`. Connect into the graph directly.

## Methods

### dispose()

> **dispose**(): `void`

Defined in: [web/src/audio/processor.ts:37](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/web/src/audio/processor.ts#L37)

Stop, disconnect, and release the worklet node.

#### Returns

`void`

***

### start()

> **start**(): `void`

Defined in: [web/src/audio/processor.ts:33](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/web/src/audio/processor.ts#L33)

Begin advancing the bridge's sample counter.

#### Returns

`void`

***

### stop()

> **stop**(): `void`

Defined in: [web/src/audio/processor.ts:35](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/web/src/audio/processor.ts#L35)

Pause advancement without tearing down the node.

#### Returns

`void`
