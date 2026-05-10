[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [edge/src](../README.md) / EdgeHostAdapter

# Variable: EdgeHostAdapter

> **EdgeHostAdapter**: `object`

Defined in: edge/src/host-adapter.ts:116

Edge host adapter namespace.

`EdgeHostAdapter.create(config)` builds a reusable adapter that resolves
Client Hints, tiers, theme compilation, and KV-backed boundary caching
in a single per-request pass.

## Type Declaration

### create

> `readonly` **create**: (`config`) => [`EdgeHostAdapter`](../interfaces/EdgeHostAdapter.md) = `createEdgeHostAdapter`

Alias for [createEdgeHostAdapter](../functions/createEdgeHostAdapter.md).

Create an EdgeHostAdapter with optional theme and boundary cache.

The returned adapter is designed to be instantiated once per worker and
reused across requests; it caches a compiled static theme eagerly and
only invokes the compile callback on cache miss when caching is enabled.

#### Parameters

##### config?

[`EdgeHostAdapterConfig`](../interfaces/EdgeHostAdapterConfig.md) = `{}`

#### Returns

[`EdgeHostAdapter`](../interfaces/EdgeHostAdapter.md)
