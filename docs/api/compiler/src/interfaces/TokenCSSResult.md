[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [compiler/src](../README.md) / TokenCSSResult

# Interface: TokenCSSResult

Defined in: compiler/src/token-css.ts:25

Output of [TokenCSSCompiler.compile](../variables/TokenCSSCompiler.md#compile).

`properties` is the list of CSS custom property names emitted for this
token (usually one). `customProperties` bundles any `@property`
registrations and the `:root` fallback block. `themed` contains
per-variant override blocks derived from an optional theme.

## Properties

### customProperties

> `readonly` **customProperties**: `string`

Defined in: compiler/src/token-css.ts:29

`@property` registrations plus the `:root { … }` fallback block.

***

### properties

> `readonly` **properties**: readonly `string`[]

Defined in: compiler/src/token-css.ts:27

CSS custom property names emitted for this token.

***

### themed

> `readonly` **themed**: `string`

Defined in: compiler/src/token-css.ts:31

`html[data-theme="…"]` override blocks (empty when no theme supplied).
