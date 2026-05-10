[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [edge/src](../README.md) / BoundaryCache

# Interface: BoundaryCache

Defined in: [edge/src/kv-cache.ts:41](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/edge/src/kv-cache.ts#L41)

Content-addressed cache for boundary compilation results keyed by
tier combination.

## Methods

### getCompiledOutputs()

> **getCompiledOutputs**(`boundaryId`, `tierResult`): `Promise`\<[`CompiledOutputs`](CompiledOutputs.md) \| `null`\>

Defined in: [edge/src/kv-cache.ts:42](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/edge/src/kv-cache.ts#L42)

#### Parameters

##### boundaryId

`ContentAddress`

##### tierResult

[`EdgeTierResult`](EdgeTierResult.md)

#### Returns

`Promise`\<[`CompiledOutputs`](CompiledOutputs.md) \| `null`\>

***

### putCompiledOutputs()

> **putCompiledOutputs**(`boundaryId`, `tierResult`, `outputs`): `Promise`\<`void`\>

Defined in: [edge/src/kv-cache.ts:44](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/edge/src/kv-cache.ts#L44)

#### Parameters

##### boundaryId

`ContentAddress`

##### tierResult

[`EdgeTierResult`](EdgeTierResult.md)

##### outputs

[`CompiledOutputs`](CompiledOutputs.md)

#### Returns

`Promise`\<`void`\>
