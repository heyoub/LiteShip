[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [edge/src](../README.md) / createBoundaryCache

# Function: createBoundaryCache()

> **createBoundaryCache**(`kv`, `options?`): [`BoundaryCache`](../interfaces/BoundaryCache.md)

Defined in: [edge/src/kv-cache.ts:100](https://github.com/heyoub/LiteShip/blob/main/packages/edge/src/kv-cache.ts#L100)

Create a [BoundaryCache](../interfaces/BoundaryCache.md) backed by the provided KV namespace.

Cache keys encode the boundary content address and the two-axis tier
result so each tier combination gets its own cached compilation output.

## Parameters

### kv

[`KVNamespace`](../interfaces/KVNamespace.md)

A generic KV namespace implementing get/put

### options?

`CacheOptions`

Optional TTL (seconds) and key prefix configuration

## Returns

[`BoundaryCache`](../interfaces/BoundaryCache.md)

A [BoundaryCache](../interfaces/BoundaryCache.md) instance

## Example

```ts
import { KVCache } from '@czap/edge';
import { ContentAddress } from '@czap/core';

const kv = { get: async (k: string) => null, put: async (k: string, v: string) => {} };
const cache = KVCache.createBoundaryCache(kv, { ttl: 3600, prefix: 'myapp' });

const boundaryId = ContentAddress('fnv1a:abcd1234');
const tierResult = {
  capLevel: 'reactive',
  motionTier: 'transitions',
  designTier: 'standard',
} as const;

// Store compiled outputs
await cache.putCompiledOutputs(boundaryId, tierResult, {
  css: '...',
  propertyRegistrations: '...',
  containerQueries: '...',
});

// Retrieve cached outputs
const cached = await cache.getCompiledOutputs(boundaryId, tierResult);
```
