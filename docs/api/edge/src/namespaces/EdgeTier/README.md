[**czap**](../../../../README.md)

***

[czap](../../../../README.md) / [edge/src](../../README.md) / EdgeTier

# EdgeTier

Edge tier detection namespace.

Pairs [ClientHints.parseClientHints](../../variables/ClientHints.md#parseclienthints) with the pure tier-mapping
functions from `@czap/detect` so the edge and the browser produce the
same `capLevel`/`motionTier`/`designTier` triple for a given device.

## Example

```ts
import { EdgeTier } from '@czap/edge';

const result = EdgeTier.detectTier(request.headers);
const html = `<html ${EdgeTier.tierDataAttributes(result)}>`;
// `<html data-czap-cap="reactive" data-czap-motion="animations" data-czap-design="enhanced">`
```

## Type Aliases

- [Result](type-aliases/Result.md)
