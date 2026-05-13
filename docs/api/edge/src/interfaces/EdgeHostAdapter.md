[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [edge/src](../README.md) / EdgeHostAdapter

# Interface: EdgeHostAdapter

Defined in: [edge/src/host-adapter.ts:116](https://github.com/heyoub/LiteShip/blob/main/packages/edge/src/host-adapter.ts#L116)

Opaque host-facing adapter returned by [createEdgeHostAdapter](../functions/createEdgeHostAdapter.md).

Call `resolve(headers)` per request; the adapter drives tier detection,
theme compilation, and boundary caching in a single pass.

## Methods

### resolve()

> **resolve**(`headers`): `Promise`\<[`EdgeHostResolution`](EdgeHostResolution.md)\>

Defined in: [edge/src/host-adapter.ts:118](https://github.com/heyoub/LiteShip/blob/main/packages/edge/src/host-adapter.ts#L118)

Resolve a request's device context, theme, and compiled outputs.

#### Parameters

##### headers

[`ClientHintsHeaders`](ClientHintsHeaders.md) \| `Headers`

#### Returns

`Promise`\<[`EdgeHostResolution`](EdgeHostResolution.md)\>
