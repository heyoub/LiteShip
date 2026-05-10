[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [vite/src](../README.md) / compileStyleBlock

# Function: compileStyleBlock()

> **compileStyleBlock**(`block`, `style`): `string`

Defined in: vite/src/style-transform.ts:143

Compile a parsed [StyleBlock](../interfaces/StyleBlock.md) plus a resolved `StyleDef` into
scoped CSS with `@layer`, `@scope`, and `@starting-style` rules.
Delegates to the canonical `StyleCSSCompiler` to avoid duplicating
style-to-CSS logic.

## Parameters

### block

[`StyleBlock`](../interfaces/StyleBlock.md)

### style

[`Shape`](#)

## Returns

`string`
