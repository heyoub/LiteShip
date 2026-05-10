[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [web/src](../README.md) / HtmlPolicy

# Type Alias: HtmlPolicy

> **HtmlPolicy** = `"text"` \| `"sanitized-html"` \| `"trusted-html"`

Defined in: web/src/types.ts:168

Trust level a slot applies to string content injected into it.

- `text`: always inserted via `textContent` (never parsed as HTML).
- `sanitized-html`: parsed and then passed through the project's
  sanitizer (`sanitizeHTML`).
- `trusted-html`: caller has proven the HTML is trusted (e.g. it came
  from a compiled template or a Trusted Types policy).
