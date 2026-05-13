[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [scene/src](../README.md) / Layout

# Variable: Layout

> `const` **Layout**: `object`

Defined in: [scene/src/sugar/layout.ts:19](https://github.com/heyoub/LiteShip/blob/main/packages/scene/src/sugar/layout.ts#L19)

Layout helpers for multi-track arrangement.

## Type Declaration

### grid

> **grid**: (`cols`, `tracks`) => readonly [`VideoTrack`](../interfaces/VideoTrack.md)[]

Assign layer values based on column count — tracks in the same row share a layer.

#### Parameters

##### cols

`number`

##### tracks

readonly [`VideoTrack`](../interfaces/VideoTrack.md)[]

#### Returns

readonly [`VideoTrack`](../interfaces/VideoTrack.md)[]

### stack

> **stack**: (`tracks`) => readonly [`VideoTrack`](../interfaces/VideoTrack.md)[]

Assign ascending layer values — first track on layer 0, next on 1, etc.

#### Parameters

##### tracks

readonly [`VideoTrack`](../interfaces/VideoTrack.md)[]

#### Returns

readonly [`VideoTrack`](../interfaces/VideoTrack.md)[]
