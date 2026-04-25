[**czap**](../../../../README.md)

***

[czap](../../../../README.md) / [edge/src](../../README.md) / ClientHints

# ClientHints

Client Hints namespace.

Parses HTTP Client Hints headers into the same
[ExtendedDeviceCapabilities](#) structure used by `@czap/detect`,
enabling server-side / edge-side tier mapping without browser APIs.
Also generates the `Accept-CH` and `Critical-CH` response headers needed
to request hints from the browser.

## Example

```ts
import { ClientHints } from '@czap/edge';

// In an edge handler:
const caps = ClientHints.parseClientHints(request.headers);
const response = new Response(body, {
  headers: {
    'Accept-CH': ClientHints.acceptCHHeader(),
    'Critical-CH': ClientHints.criticalCHHeader(),
  },
});
```

## Type Aliases

- [Headers](type-aliases/Headers.md)
