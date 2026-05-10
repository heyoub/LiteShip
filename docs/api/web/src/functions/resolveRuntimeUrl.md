[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [web/src](../README.md) / resolveRuntimeUrl

# Function: resolveRuntimeUrl()

> **resolveRuntimeUrl**(`rawUrl`, `options`): [`RuntimeUrlResolution`](../type-aliases/RuntimeUrlResolution.md)

Defined in: web/src/security/runtime-url.ts:250

Resolve a user-supplied `rawUrl` under `options.policy` and classify
the result as one of [RuntimeUrlResolution](../type-aliases/RuntimeUrlResolution.md)'s variants.

The function never throws; malformed URLs produce a `malformed`
variant and cross-origin / policy violations produce correspondingly
typed rejections. Relative URLs inherit the base origin and bypass
the private-IP SSRF check (they cannot point outside it).

## Parameters

### rawUrl

`string` \| `null` \| `undefined`

### options

`ResolveRuntimeUrlOptions`

## Returns

[`RuntimeUrlResolution`](../type-aliases/RuntimeUrlResolution.md)
