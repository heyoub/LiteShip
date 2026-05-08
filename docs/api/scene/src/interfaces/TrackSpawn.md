[**czap**](../../../README.md)

***

[czap](../../../README.md) / [scene/src](../README.md) / TrackSpawn

# Interface: TrackSpawn

Defined in: [scene/src/compile.ts:27](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/scene/src/compile.ts#L27)

One compiled track — the components the runtime should spawn for it.
The `trackId` is preserved from the contract so downstream code can
cross-reference (e.g. transition `between` refs).

## Properties

### components

> `readonly` **components**: `Readonly`\<`Record`\<`string`, `unknown`\>\>

Defined in: [scene/src/compile.ts:31](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/scene/src/compile.ts#L31)

Component seed map handed to World.spawn.

***

### trackId

> `readonly` **trackId**: [`TrackId`](../type-aliases/TrackId.md)\<`TrackKind`\>

Defined in: [scene/src/compile.ts:29](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/scene/src/compile.ts#L29)

The phantom-kinded id of the source track.
