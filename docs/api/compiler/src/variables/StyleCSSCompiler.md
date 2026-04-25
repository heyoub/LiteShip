[**czap**](../../../README.md)

***

[czap](../../../README.md) / [compiler/src](../README.md) / StyleCSSCompiler

# Variable: StyleCSSCompiler

> `const` **StyleCSSCompiler**: `object`

Defined in: [compiler/src/style-css.ts:201](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/compiler/src/style-css.ts#L201)

Style CSS compiler namespace.

Compiles a [Style.Shape](#) into cascade-layered, scoped CSS using
`@layer`, `@scope`, `@starting-style`, and `@container` — the modern CSS
features that let czap deliver component isolation and state-driven
restyling without runtime class toggling.

## Type Declaration

### compile

> **compile**: (`style`, `componentName?`) => [`StyleCSSResult`](../interfaces/StyleCSSResult.md)

Compile a style definition into scoped, layered CSS.

Compile a [Style.Shape](#) into layered, scoped CSS.

When `componentName` is supplied the output is wrapped in an `@scope`
block targeting `.czap-<name>` and bounded at `[data-czap-slot]`
children. Boundary states are compiled into nested `@container` rules
via the core [CSSCompiler](CSSCompiler.md).

#### Parameters

##### style

[`Shape`](#)

##### componentName?

`string`

#### Returns

[`StyleCSSResult`](../interfaces/StyleCSSResult.md)
