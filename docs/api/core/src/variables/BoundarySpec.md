[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [core/src](../README.md) / BoundarySpec

# Variable: BoundarySpec

> **BoundarySpec**: `object`

Defined in: [core/src/boundary.ts:314](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/boundary.ts#L314)

BoundarySpec namespace — helpers for working with the optional activation filter on a boundary.

## Type Declaration

### isActive

> **isActive**: (`spec`, `context?`) => `boolean` = `_isSpecActive`

Check whether a BoundarySpec allows evaluation in the given context.

Check if a BoundarySpec allows evaluation given current context.

#### Parameters

##### spec

[`BoundarySpec`](../interfaces/BoundarySpec.md) \| `undefined`

##### context?

###### activeExperiments?

readonly `string`[]

###### capabilities?

`Record`\<`string`, `unknown`\>

###### nowMs?

`number`

#### Returns

`boolean`
