[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [web/src](../README.md) / createHtmlFragment

# Function: createHtmlFragment()

> **createHtmlFragment**(`html`, `options?`): `DocumentFragment`

Defined in: [web/src/security/html-trust.ts:233](https://github.com/heyoub/LiteShip/blob/main/packages/web/src/security/html-trust.ts#L233)

Parse `html` under `options.policy` and return a `DocumentFragment`
ready to be appended to the live DOM. Dangerous elements
(`<script>`, `<iframe>`, `<base>`, `<meta>`, `<link>`, `<form>`,
`<noscript>`, `<svg>`, `<math>`, `<style>`, `<object>`, `<embed>`)
and attributes (`on*`, `srcdoc`, `style`, `javascript:` /
`data:text/html` URLs in url-sink attributes including `href`,
`src`, `action`, `formaction`, `ping`, `background`, `cite`,
`data`, `poster`) are stripped when the effective policy is
`sanitized-html`.

## Parameters

### html

`string`

### options?

`HtmlTrustOptions`

## Returns

`DocumentFragment`
