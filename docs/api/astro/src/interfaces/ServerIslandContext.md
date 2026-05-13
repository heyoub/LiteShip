[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [astro/src](../README.md) / ServerIslandContext

# Interface: ServerIslandContext

Defined in: [astro/src/quantize.ts:22](https://github.com/heyoub/LiteShip/blob/main/packages/astro/src/quantize.ts#L22)

Server-only context that [resolveInitialState](../functions/resolveInitialState.md) consumes. Astro
builds this from the incoming request (user agent + Client Hints)
and the tier detected by the edge middleware.

## Properties

### clientHints

> `readonly` **clientHints**: `Record`\<`string`, `string`\>

Defined in: [astro/src/quantize.ts:26](https://github.com/heyoub/LiteShip/blob/main/packages/astro/src/quantize.ts#L26)

Flat Client Hints header map.

***

### detectedTier

> `readonly` **detectedTier**: [`CapLevel`](#)

Defined in: [astro/src/quantize.ts:28](https://github.com/heyoub/LiteShip/blob/main/packages/astro/src/quantize.ts#L28)

Tier detected by `@czap/edge`.

***

### userAgent

> `readonly` **userAgent**: `string`

Defined in: [astro/src/quantize.ts:24](https://github.com/heyoub/LiteShip/blob/main/packages/astro/src/quantize.ts#L24)

Raw `User-Agent` header.
