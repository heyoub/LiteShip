[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [edge/src](../README.md) / createEdgeHostAdapter

# Function: createEdgeHostAdapter()

> **createEdgeHostAdapter**(`config?`): [`EdgeHostAdapter`](../interfaces/EdgeHostAdapter.md)

Defined in: edge/src/host-adapter.ts:138

Create an [EdgeHostAdapter](../variables/EdgeHostAdapter.md) with optional theme and boundary cache.

The returned adapter is designed to be instantiated once per worker and
reused across requests; it caches a compiled static theme eagerly and
only invokes the compile callback on cache miss when caching is enabled.

## Parameters

### config?

[`EdgeHostAdapterConfig`](../interfaces/EdgeHostAdapterConfig.md) = `{}`

## Returns

[`EdgeHostAdapter`](../interfaces/EdgeHostAdapter.md)
