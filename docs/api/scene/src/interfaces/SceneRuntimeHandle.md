[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [scene/src](../README.md) / SceneRuntimeHandle

# Interface: SceneRuntimeHandle

Defined in: [scene/src/runtime.ts:112](https://github.com/heyoub/LiteShip/blob/main/packages/scene/src/runtime.ts#L112)

Live runtime handle returned by [SceneRuntime.build](../variables/SceneRuntime.md#build).

## Properties

### currentFrame

> `readonly` **currentFrame**: () => `number`

Defined in: [scene/src/runtime.ts:122](https://github.com/heyoub/LiteShip/blob/main/packages/scene/src/runtime.ts#L122)

Current frame index derived from `currentTimeMs * fps / 1000`.

#### Returns

`number`

***

### currentTimeMs

> `readonly` **currentTimeMs**: () => `number`

Defined in: [scene/src/runtime.ts:120](https://github.com/heyoub/LiteShip/blob/main/packages/scene/src/runtime.ts#L120)

Current scene time in milliseconds (advanced by [tick](#tick)).

#### Returns

`number`

***

### entitySpawnCount

> `readonly` **entitySpawnCount**: `number`

Defined in: [scene/src/runtime.ts:118](https://github.com/heyoub/LiteShip/blob/main/packages/scene/src/runtime.ts#L118)

Number of entities spawned at build time (one per scene track).

***

### receipts

> `readonly` **receipts**: readonly [`MixReceipt`](MixReceipt.md)[]

Defined in: [scene/src/runtime.ts:124](https://github.com/heyoub/LiteShip/blob/main/packages/scene/src/runtime.ts#L124)

Mix receipts collected via the configured sink. Empty when a custom sink was supplied.

***

### release

> `readonly` **release**: () => `Promise`\<`void`\>

Defined in: [scene/src/runtime.ts:131](https://github.com/heyoub/LiteShip/blob/main/packages/scene/src/runtime.ts#L131)

Release the world's scope. Idempotent.

#### Returns

`Promise`\<`void`\>

***

### systemsRegistered

> `readonly` **systemsRegistered**: `number`

Defined in: [scene/src/runtime.ts:116](https://github.com/heyoub/LiteShip/blob/main/packages/scene/src/runtime.ts#L116)

Number of systems registered (always [CANONICAL\_SYSTEM\_COUNT](#)).

***

### tick

> `readonly` **tick**: (`dtMs`) => `Promise`\<`void`\>

Defined in: [scene/src/runtime.ts:129](https://github.com/heyoub/LiteShip/blob/main/packages/scene/src/runtime.ts#L129)

Advance the simulation by `dtMs` milliseconds, then run every
registered system once over the world.

#### Parameters

##### dtMs

`number`

#### Returns

`Promise`\<`void`\>

***

### world

> `readonly` **world**: `WorldShape`

Defined in: [scene/src/runtime.ts:114](https://github.com/heyoub/LiteShip/blob/main/packages/scene/src/runtime.ts#L114)

The underlying ECS world — exposed for query-based assertions.
