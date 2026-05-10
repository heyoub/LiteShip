[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [vite/src](../README.md) / loadVirtualModule

# Function: loadVirtualModule()

> **loadVirtualModule**(`id`): `string` \| `undefined`

Defined in: [vite/src/virtual-modules.ts:87](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/vite/src/virtual-modules.ts#L87)

Return the source for a resolved virtual module ID.

Data modules (tokens, boundaries, themes) return empty-object stubs
that provide valid JS/CSS so downstream tooling (type-checkers,
bundlers) can operate without the full transform pipeline running.
Their real content flows through the CSS transform hooks in the
plugin -- at build time the transform replaces token, theme, and
quantize blocks inline, so these stubs are only hit when a consumer
explicitly imports the virtual module (e.g. for runtime JS access
to definitions).

The `hmr-client` module is the client-side HMR handler that the
plugin injects into the page via `transformIndexHtml`.

## Parameters

### id

`string`

## Returns

`string` \| `undefined`
