[**czap**](../../../README.md)

***

[czap](../../../README.md) / [scene/src](../README.md) / EffectTrack

# Interface: EffectTrack

Defined in: [scene/src/contract.ts:57](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/scene/src/contract.ts#L57)

Effect track — applies an intensity curve to a target video track, optionally synced to audio.

## Properties

### effectKind

> `readonly` **effectKind**: `"pulse"` \| `"glow"` \| `"shake"` \| `"zoom"` \| `"desaturate"`

Defined in: [scene/src/contract.ts:62](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/scene/src/contract.ts#L62)

***

### from

> `readonly` **from**: `number`

Defined in: [scene/src/contract.ts:60](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/scene/src/contract.ts#L60)

***

### id

> `readonly` **id**: [`TrackId`](../type-aliases/TrackId.md)\<`"effect"`\>

Defined in: [scene/src/contract.ts:59](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/scene/src/contract.ts#L59)

***

### kind

> `readonly` **kind**: `"effect"`

Defined in: [scene/src/contract.ts:58](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/scene/src/contract.ts#L58)

***

### syncTo?

> `readonly` `optional` **syncTo?**: `object`

Defined in: [scene/src/contract.ts:64](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/scene/src/contract.ts#L64)

#### anchor

> `readonly` **anchor**: [`TrackId`](../type-aliases/TrackId.md)\<`"audio"`\>

#### mode

> `readonly` **mode**: `"beat"` \| `"onset"` \| `"peak"`

***

### target

> `readonly` **target**: [`TrackId`](../type-aliases/TrackId.md)\<`"video"`\>

Defined in: [scene/src/contract.ts:63](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/scene/src/contract.ts#L63)

***

### to

> `readonly` **to**: `number`

Defined in: [scene/src/contract.ts:61](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/scene/src/contract.ts#L61)
