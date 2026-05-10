[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [compiler/src](../README.md) / CSSRule

# Interface: CSSRule

Defined in: [compiler/src/css.ts:23](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/compiler/src/css.ts#L23)

A single CSS rule — a selector plus a property map.

Emitted inside a [CSSContainerRule](CSSContainerRule.md) by [CSSCompiler.compile](../variables/CSSCompiler.md#compile).

## Properties

### properties

> `readonly` **properties**: `Record`\<`string`, `string`\>

Defined in: [compiler/src/css.ts:27](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/compiler/src/css.ts#L27)

Flat property map applied inside the selector block.

***

### selector

> `readonly` **selector**: `string`

Defined in: [compiler/src/css.ts:25](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/compiler/src/css.ts#L25)

CSS selector (e.g. `.card`, `[data-state="open"]`).
