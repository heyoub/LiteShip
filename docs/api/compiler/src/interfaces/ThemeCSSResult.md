[**czap**](../../../README.md)

***

[czap](../../../README.md) / [compiler/src](../README.md) / ThemeCSSResult

# Interface: ThemeCSSResult

Defined in: [compiler/src/theme-css.ts:26](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/compiler/src/theme-css.ts#L26)

Output of [ThemeCSSCompiler.compile](../variables/ThemeCSSCompiler.md#compile).

`selectors` is the concatenated `html[data-theme="variant"]` rule block,
one per theme variant that has at least one token override. `transitions`
is the optional `:root { transition-*: … }` block emitted when the theme
carries metadata indicating animated switching is desired.

## Properties

### selectors

> `readonly` **selectors**: `string`

Defined in: [compiler/src/theme-css.ts:28](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/compiler/src/theme-css.ts#L28)

Per-variant `html[data-theme]` selector blocks.

***

### transitions

> `readonly` **transitions**: `string`

Defined in: [compiler/src/theme-css.ts:30](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/compiler/src/theme-css.ts#L30)

Optional root transition declarations for animated theme swaps.
