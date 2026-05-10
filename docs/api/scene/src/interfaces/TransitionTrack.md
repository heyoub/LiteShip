[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [scene/src](../README.md) / TransitionTrack

# Interface: TransitionTrack

Defined in: [scene/src/contract.ts:47](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/scene/src/contract.ts#L47)

Transition track — blends two video tracks across a frame window.

## Properties

### between

> `readonly` **between**: readonly \[[`TrackId`](../type-aliases/TrackId.md)\<`"video"`\>, [`TrackId`](../type-aliases/TrackId.md)\<`"video"`\>\]

Defined in: [scene/src/contract.ts:53](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/scene/src/contract.ts#L53)

***

### from

> `readonly` **from**: `number`

Defined in: [scene/src/contract.ts:50](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/scene/src/contract.ts#L50)

***

### id

> `readonly` **id**: [`TrackId`](../type-aliases/TrackId.md)\<`"transition"`\>

Defined in: [scene/src/contract.ts:49](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/scene/src/contract.ts#L49)

***

### kind

> `readonly` **kind**: `"transition"`

Defined in: [scene/src/contract.ts:48](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/scene/src/contract.ts#L48)

***

### to

> `readonly` **to**: `number`

Defined in: [scene/src/contract.ts:51](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/scene/src/contract.ts#L51)

***

### transitionKind

> `readonly` **transitionKind**: `"crossfade"` \| `"swipe.left"` \| `"swipe.right"` \| `"zoom.in"` \| `"zoom.out"` \| `"cut"`

Defined in: [scene/src/contract.ts:52](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/scene/src/contract.ts#L52)
