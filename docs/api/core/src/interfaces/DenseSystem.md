[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [core/src](../README.md) / DenseSystem

# Interface: DenseSystem

Defined in: [core/src/ecs.ts:144](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/ecs.ts#L144)

## Properties

### \_denseSystem

> `readonly` **\_denseSystem**: `true`

Defined in: [core/src/ecs.ts:147](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/ecs.ts#L147)

***

### name

> `readonly` **name**: `string`

Defined in: [core/src/ecs.ts:145](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/ecs.ts#L145)

***

### query

> `readonly` **query**: readonly `string`[]

Defined in: [core/src/ecs.ts:146](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/ecs.ts#L146)

## Methods

### execute()

> **execute**(`stores`): `Effect`\<`void`\>

Defined in: [core/src/ecs.ts:152](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/ecs.ts#L152)

Execute receives dense stores keyed by component name.
Systems iterate the typed arrays directly -- zero allocation per tick.

#### Parameters

##### stores

`ReadonlyMap`\<`string`, [`DenseStore`](DenseStore.md)\>

#### Returns

`Effect`\<`void`\>
