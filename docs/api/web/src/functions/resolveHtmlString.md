[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [web/src](../README.md) / resolveHtmlString

# Function: resolveHtmlString()

> **resolveHtmlString**(`html`, `options?`): `string`

Defined in: [web/src/security/html-trust.ts:256](https://github.com/heyoub/LiteShip/blob/main/packages/web/src/security/html-trust.ts#L256)

Serialise `html` back to string form after applying the effective
policy. Useful for host code that must hand cleaned markup to another
subsystem (e.g. a worker) rather than append it directly.

**Caveat:** the returned string was sanitized inside a `<template>`
element (the parse-then-sanitize ordering that eliminates classic
mXSS). If you then assign the string to a *live* `innerHTML` sink
(a non-`<template>` element under a different parsing context — e.g.
a table cell, `<noscript>` body, or foreign-content namespace), the
browser may re-parse it under different rules and surface mutation-XSS
vectors. Prefer [createHtmlFragment](createHtmlFragment.md) (which returns a parsed
`DocumentFragment` you can append directly) when the destination is
live DOM. Use `resolveHtmlString` only when you genuinely need a
string (e.g. handing markup to a worker, persisting to storage).

## Parameters

### html

`string`

### options?

`HtmlTrustOptions`

## Returns

`string`
