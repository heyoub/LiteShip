[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [scene/src](../README.md) / TrackSpawn

# Interface: TrackSpawn

Defined in: scene/src/compile.ts:27

One compiled track — the components the runtime should spawn for it.
The `trackId` is preserved from the contract so downstream code can
cross-reference (e.g. transition `between` refs).

## Properties

### components

> `readonly` **components**: `Readonly`\<`Record`\<`string`, `unknown`\>\>

Defined in: scene/src/compile.ts:31

Component seed map passed to `world.spawn(...)` when [SceneRuntime](../namespaces/SceneRuntime/README.md) builds the ECS world.

***

### trackId

> `readonly` **trackId**: [`TrackId`](../type-aliases/TrackId.md)\<`TrackKind`\>

Defined in: scene/src/compile.ts:29

The phantom-kinded id of the source track.
