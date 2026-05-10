[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [scene/src](../README.md) / EffectTrack

# Interface: EffectTrack

Defined in: scene/src/contract.ts:57

Effect track — applies an intensity curve to a target video track, optionally synced to audio.

## Properties

### effectKind

> `readonly` **effectKind**: `"pulse"` \| `"glow"` \| `"shake"` \| `"zoom"` \| `"desaturate"`

Defined in: scene/src/contract.ts:62

***

### from

> `readonly` **from**: `number`

Defined in: scene/src/contract.ts:60

***

### id

> `readonly` **id**: [`TrackId`](../type-aliases/TrackId.md)\<`"effect"`\>

Defined in: scene/src/contract.ts:59

***

### kind

> `readonly` **kind**: `"effect"`

Defined in: scene/src/contract.ts:58

***

### syncTo?

> `readonly` `optional` **syncTo?**: `object`

Defined in: scene/src/contract.ts:64

#### anchor

> `readonly` **anchor**: [`TrackId`](../type-aliases/TrackId.md)\<`"audio"`\>

#### mode

> `readonly` **mode**: `"beat"` \| `"onset"` \| `"peak"`

***

### target

> `readonly` **target**: [`TrackId`](../type-aliases/TrackId.md)\<`"video"`\>

Defined in: scene/src/contract.ts:63

***

### to

> `readonly` **to**: `number`

Defined in: scene/src/contract.ts:61
