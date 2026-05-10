[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [scene/src](../README.md) / AudioTrack

# Interface: AudioTrack

Defined in: scene/src/contract.ts:33

Audio track — plays an asset with optional mix metadata.

## Properties

### from

> `readonly` **from**: `number`

Defined in: scene/src/contract.ts:36

***

### id

> `readonly` **id**: [`TrackId`](../type-aliases/TrackId.md)\<`"audio"`\>

Defined in: scene/src/contract.ts:35

***

### kind

> `readonly` **kind**: `"audio"`

Defined in: scene/src/contract.ts:34

***

### mix?

> `readonly` `optional` **mix?**: `object`

Defined in: scene/src/contract.ts:39

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

Defined in: scene/src/contract.ts:38

***

### to

> `readonly` **to**: `number`

Defined in: scene/src/contract.ts:37
