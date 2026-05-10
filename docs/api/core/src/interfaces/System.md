[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [core/src](../README.md) / System

# Interface: System

Defined in: [core/src/ecs.ts:159](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/ecs.ts#L159)

## Properties

### \_denseSystem?

> `readonly` `optional` **\_denseSystem?**: `undefined`

Defined in: [core/src/ecs.ts:162](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/ecs.ts#L162)

***

### name

> `readonly` **name**: `string`

Defined in: [core/src/ecs.ts:160](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/ecs.ts#L160)

***

### query

> `readonly` **query**: readonly `string`[]

Defined in: [core/src/ecs.ts:161](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/ecs.ts#L161)

## Methods

### execute()

> **execute**(`entities`, `world?`): `Effect`\<`void`\>

Defined in: [core/src/ecs.ts:164](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/ecs.ts#L164)

Second argument is the world — use it to write computed output components back.

#### Parameters

##### entities

readonly [`Entity`](Entity.md)[]

##### world?

`WorldShape`

#### Returns

`Effect`\<`void`\>
