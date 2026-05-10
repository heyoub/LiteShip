[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [web/src](../README.md) / createHtmlFragment

# Function: createHtmlFragment()

> **createHtmlFragment**(`html`, `options?`): `DocumentFragment`

Defined in: web/src/security/html-trust.ts:121

Parse `html` under `options.policy` and return a `DocumentFragment`
ready to be appended to the live DOM. Dangerous elements
(`<script>`, `<iframe>`, etc.) and attributes (`on*`, `srcdoc`,
javascript/data URLs) are stripped when the effective policy is
`sanitized-html`.

## Parameters

### html

`string`

### options?

`HtmlTrustOptions`

## Returns

`DocumentFragment`
