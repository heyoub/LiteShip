[**czap**](../../../README.md)

***

[czap](../../../README.md) / [edge/src](../README.md) / EdgeHostCacheConfig

# Interface: EdgeHostCacheConfig

Defined in: [edge/src/host-adapter.ts:55](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/edge/src/host-adapter.ts#L55)

Cache configuration for the edge host adapter.

When set, per-boundary compiled outputs are memoized in the supplied KV
namespace keyed by `(boundaryId, tier)`. `compile` is the user-provided
function that produces the outputs on a cache miss; its result is
written back to KV with the configured `ttl`.

## Properties

### boundaryId

> `readonly` **boundaryId**: `ContentAddress`

Defined in: [edge/src/host-adapter.ts:59](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/edge/src/host-adapter.ts#L59)

Content address of the boundary being compiled.

***

### compile

> `readonly` **compile**: (`context`) => [`CompiledOutputs`](CompiledOutputs.md) \| `Promise`\<[`CompiledOutputs`](CompiledOutputs.md)\>

Defined in: [edge/src/host-adapter.ts:61](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/edge/src/host-adapter.ts#L61)

Compile function invoked on cache miss.

#### Parameters

##### context

[`EdgeHostCompileContext`](EdgeHostCompileContext.md)

#### Returns

[`CompiledOutputs`](CompiledOutputs.md) \| `Promise`\<[`CompiledOutputs`](CompiledOutputs.md)\>

***

### kv

> `readonly` **kv**: [`KVNamespace`](KVNamespace.md)

Defined in: [edge/src/host-adapter.ts:57](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/edge/src/host-adapter.ts#L57)

KV namespace backing the boundary cache.

***

### prefix?

> `readonly` `optional` **prefix?**: `string`

Defined in: [edge/src/host-adapter.ts:65](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/edge/src/host-adapter.ts#L65)

Optional KV key prefix.

***

### ttl?

> `readonly` `optional` **ttl?**: `number`

Defined in: [edge/src/host-adapter.ts:63](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/edge/src/host-adapter.ts#L63)

Cache entry TTL in seconds.
