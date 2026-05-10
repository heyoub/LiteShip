[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [web/src](../README.md) / resolveHtmlString

# Function: resolveHtmlString()

> **resolveHtmlString**(`html`, `options?`): `string`

Defined in: [web/src/security/html-trust.ts:130](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/web/src/security/html-trust.ts#L130)

Serialise `html` back to string form after applying the effective
policy. Useful for host code that must hand cleaned markup to another
subsystem (e.g. a worker) rather than append it directly.

## Parameters

### html

`string`

### options?

`HtmlTrustOptions`

## Returns

`string`
