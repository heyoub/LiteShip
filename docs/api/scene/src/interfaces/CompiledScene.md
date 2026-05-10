[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [scene/src](../README.md) / CompiledScene

# Interface: CompiledScene

Defined in: [scene/src/compile.ts:39](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/scene/src/compile.ts#L39)

The descriptor produced by [compileScene](../functions/compileScene.md). Pure data —
no Effects, no scope, no world. Hand it to [SceneRuntime.build](../variables/SceneRuntime.md#build)
to obtain a live tickable handle.

## Properties

### beats

> `readonly` **beats**: readonly [`BeatComponent`](BeatComponent.md)[]

Defined in: [scene/src/compile.ts:55](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/scene/src/compile.ts#L55)

Pre-computed beat markers (Task 9 wired these via the
`scene.beat-binding` sceneComposition capsule). Each entry becomes
a `Beat`-tagged ECS entity at runtime build time so SyncSystem can
query the world for beats instead of reading closure state.

Empty for vanilla compile — scenes that need beat-driven sync
declare them via [SceneContract.beats](SceneContract.md#beats) or pull from a
referenced BeatMarkerProjection asset.

***

### bpm

> `readonly` **bpm**: `number`

Defined in: [scene/src/compile.ts:43](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/scene/src/compile.ts#L43)

***

### duration

> `readonly` **duration**: `number`

Defined in: [scene/src/compile.ts:41](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/scene/src/compile.ts#L41)

***

### fps

> `readonly` **fps**: `number`

Defined in: [scene/src/compile.ts:42](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/scene/src/compile.ts#L42)

***

### name

> `readonly` **name**: `string`

Defined in: [scene/src/compile.ts:40](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/scene/src/compile.ts#L40)

***

### trackSpawns

> `readonly` **trackSpawns**: readonly [`TrackSpawn`](TrackSpawn.md)[]

Defined in: [scene/src/compile.ts:44](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/scene/src/compile.ts#L44)
