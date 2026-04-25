[**czap**](../../../../../README.md)

***

[czap](../../../../../README.md) / [core/src](../../../README.md) / [Harness](../README.md) / generateCachedProjection

# Function: generateCachedProjection()

> **generateCachedProjection**(`cap`): [`HarnessOutput`](../interfaces/HarnessOutput.md)

Defined in: [core/src/harness/cached-projection.ts:20](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/harness/cached-projection.ts#L20)

Generate the test + bench file contents for a `cachedProjection` capsule.
Emits `it.skip` placeholders for cache-hit and invalidation tests.

## Parameters

### cap

[`CapsuleDef`](../../../interfaces/CapsuleDef.md)\<`"cachedProjection"`, `unknown`, `unknown`, `unknown`\>

## Returns

[`HarnessOutput`](../interfaces/HarnessOutput.md)
