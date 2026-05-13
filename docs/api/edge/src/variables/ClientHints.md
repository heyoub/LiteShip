[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [edge/src](../README.md) / ClientHints

# Variable: ClientHints

> `const` **ClientHints**: `object`

Defined in: [edge/src/client-hints.ts:326](https://github.com/heyoub/LiteShip/blob/main/packages/edge/src/client-hints.ts#L326)

Client Hints namespace.

Parses HTTP Client Hints headers into the same
[ExtendedDeviceCapabilities](#) structure used by `@czap/detect`,
enabling server-side / edge-side tier mapping without browser APIs.
Also generates the `Accept-CH` and `Critical-CH` response headers needed
to request hints from the browser.

## Type Declaration

### acceptCHHeader

> **acceptCHHeader**: () => `string`

Produce the `Accept-CH` response header value listing all useful hints.

Generate the `Accept-CH` header value for requesting all useful Client Hints
on subsequent requests.

#### Returns

`string`

A comma-separated list of Client Hint header names

#### Example

```ts
import { ClientHints } from '@czap/edge';

const response = new Response('OK', {
  headers: { 'Accept-CH': ClientHints.acceptCHHeader() },
});
```

### criticalCHHeader

> **criticalCHHeader**: () => `string`

Produce the `Critical-CH` response header value listing boot-required hints.

Generate the `Critical-CH` header value for hints needed on the very first
request (triggers a browser retry if missing).

#### Returns

`string`

A comma-separated list of critical Client Hint header names

#### Example

```ts
import { ClientHints } from '@czap/edge';

const response = new Response('OK', {
  headers: {
    'Accept-CH': ClientHints.acceptCHHeader(),
    'Critical-CH': ClientHints.criticalCHHeader(),
  },
});
```

### parseClientHints

> **parseClientHints**: (`headers`) => [`ExtendedDeviceCapabilities`](#)

Parse Client Hints headers into [ExtendedDeviceCapabilities](#).

Parse Client Hints headers into an [ExtendedDeviceCapabilities](#) structure.

For properties that cannot be determined from headers (GPU tier, WebGPU
support, CPU cores), conservative defaults are used.

#### Parameters

##### headers

[`ClientHintsHeaders`](../interfaces/ClientHintsHeaders.md) \| `Headers`

Client Hints headers (plain object or Web API Headers)

#### Returns

[`ExtendedDeviceCapabilities`](#)

An [ExtendedDeviceCapabilities](#) structure

#### Example

```ts
import { ClientHints } from '@czap/edge';

const caps = ClientHints.parseClientHints({
  'sec-ch-device-memory': '8',
  'sec-ch-dpr': '2',
  'sec-ch-viewport-width': '1440',
  'sec-ch-prefers-color-scheme': 'dark',
  'sec-ch-ua-mobile': '?0',
});
console.log(caps.memory);             // 8
console.log(caps.devicePixelRatio);    // 2
console.log(caps.prefersColorScheme);  // 'dark'
```

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
