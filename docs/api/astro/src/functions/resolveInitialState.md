[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [astro/src](../README.md) / resolveInitialState

# Function: resolveInitialState()

> **resolveInitialState**\<`B`\>(`boundary`, `context`): `string`

Defined in: [astro/src/quantize.ts:133](https://github.com/heyoub/LiteShip/blob/main/packages/astro/src/quantize.ts#L133)

Resolve the initial boundary state for server-side rendering.

Priority:
  1. Use viewport width from client hints if available
  2. Estimate viewport from user agent
  3. Fall back to tier-based synthetic value

Evaluates the boundary thresholds to find the matching state.

## Type Parameters

### B

`B` *extends* [`Shape`](#)\<`string`, readonly \[`string`, `string`\]\>

## Parameters

### boundary

`B`

### context

[`ServerIslandContext`](../interfaces/ServerIslandContext.md)

## Returns

`string`
