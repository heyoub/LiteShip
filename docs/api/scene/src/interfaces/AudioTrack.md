[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [scene/src](../README.md) / AudioTrack

# Interface: AudioTrack

Defined in: [scene/src/contract.ts:33](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/scene/src/contract.ts#L33)

Audio track — plays an asset with optional mix metadata.

## Properties

### from

> `readonly` **from**: `number`

Defined in: [scene/src/contract.ts:36](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/scene/src/contract.ts#L36)

***

### id

> `readonly` **id**: [`TrackId`](../type-aliases/TrackId.md)\<`"audio"`\>

Defined in: [scene/src/contract.ts:35](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/scene/src/contract.ts#L35)

***

### kind

> `readonly` **kind**: `"audio"`

Defined in: [scene/src/contract.ts:34](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/scene/src/contract.ts#L34)

***

### mix?

> `readonly` `optional` **mix?**: `object`

Defined in: [scene/src/contract.ts:39](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/scene/src/contract.ts#L39)

#### pan?

> `readonly` `optional` **pan?**: `number`

#### sync?

> `readonly` `optional` **sync?**: `object`

##### sync.bpm?

> `readonly` `optional` **bpm?**: `number`

#### volume?

> `readonly` `optional` **volume?**: `number`

***

### source

> `readonly` **source**: `string`

Defined in: [scene/src/contract.ts:38](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/scene/src/contract.ts#L38)

***

### to

> `readonly` **to**: `number`

Defined in: [scene/src/contract.ts:37](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/scene/src/contract.ts#L37)
