[**czap**](../../../../../README.md)

***

[czap](../../../../../README.md) / [core/src](../../../README.md) / [Harness](../README.md) / generateSiteAdapter

# Function: generateSiteAdapter()

> **generateSiteAdapter**(`cap`): [`HarnessOutput`](../interfaces/HarnessOutput.md)

Defined in: [core/src/harness/site-adapter.ts:19](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/harness/site-adapter.ts#L19)

Generate the test + bench file contents for a `siteAdapter` capsule.
Emits `it.skip` placeholders for round-trip and host-capability tests.

## Parameters

### cap

[`CapsuleDef`](../../../interfaces/CapsuleDef.md)\<`"siteAdapter"`, `unknown`, `unknown`, `unknown`\>

## Returns

[`HarnessOutput`](../interfaces/HarnessOutput.md)
