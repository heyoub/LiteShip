[**czap**](../../../README.md)

***

[czap](../../../README.md) / [scene/src](../README.md) / SceneRuntimeOptions

# Interface: SceneRuntimeOptions

Defined in: [scene/src/runtime.ts:100](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/scene/src/runtime.ts#L100)

Options accepted by [SceneRuntime.build](../variables/SceneRuntime.md#build).

## Properties

### mixSink?

> `readonly` `optional` **mixSink?**: (`receipt`) => `void`

Defined in: [scene/src/runtime.ts:108](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/scene/src/runtime.ts#L108)

Mix-receipt sink for PassThroughMixer. Defaults to a bounded ring
(last [DEFAULT\_MIX\_RECEIPT\_CAP](#) receipts) accessible via
`handle.receipts`. Pass an explicit sink to receive every receipt.

#### Parameters

##### receipt

[`MixReceipt`](MixReceipt.md)

#### Returns

`void`

***

### sampleRate?

> `readonly` `optional` **sampleRate?**: `number`

Defined in: [scene/src/runtime.ts:102](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/scene/src/runtime.ts#L102)

Audio sample rate fed to AudioSystem. Defaults to 48_000.
