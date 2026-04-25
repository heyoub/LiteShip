[**czap**](../../../README.md)

***

[czap](../../../README.md) / [edge/src](../README.md) / EdgeTier

# Variable: EdgeTier

> `const` **EdgeTier**: `object`

Defined in: [edge/src/edge-tier.ts:83](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/edge/src/edge-tier.ts#L83)

Edge tier detection namespace.

Pairs [ClientHints.parseClientHints](ClientHints.md#parseclienthints) with the pure tier-mapping
functions from `@czap/detect` so the edge and the browser produce the
same `capLevel`/`motionTier`/`designTier` triple for a given device.

## Type Declaration

### detectTier

> **detectTier**: (`headers`) => [`EdgeTierResult`](../interfaces/EdgeTierResult.md)

Detect [EdgeTierResult](../interfaces/EdgeTierResult.md) from a `Headers`-like bag.

Detect capability tiers from HTTP headers using Client Hints parsing
and the same pure tier mapping functions used on the client.

#### Parameters

##### headers

[`ClientHintsHeaders`](../interfaces/ClientHintsHeaders.md) \| `Headers`

#### Returns

[`EdgeTierResult`](../interfaces/EdgeTierResult.md)

### tierDataAttributes

> **tierDataAttributes**: (`result`) => `string`

Render an `EdgeTierResult` into `data-czap-*` attributes for the root HTML element.

Generate HTML data attribute string for injection into the `<html>` element.

#### Parameters

##### result

[`EdgeTierResult`](../interfaces/EdgeTierResult.md)

#### Returns

`string`

#### Example

```
tierDataAttributes(result)
// => 'data-czap-cap="reactive" data-czap-motion="animations" data-czap-design="enhanced"'
```

## Example

```ts
import { EdgeTier } from '@czap/edge';

const result = EdgeTier.detectTier(request.headers);
const html = `<html ${EdgeTier.tierDataAttributes(result)}>`;
// `<html data-czap-cap="reactive" data-czap-motion="animations" data-czap-design="enhanced">`
```
