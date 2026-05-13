[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [compiler/src](../README.md) / StyleCSSResult

# Interface: StyleCSSResult

Defined in: [compiler/src/style-css.ts:30](https://github.com/heyoub/LiteShip/blob/main/packages/compiler/src/style-css.ts#L30)

Output of [StyleCSSCompiler.compile](../variables/StyleCSSCompiler.md#compile).

Three complementary serializations: `scoped` is the raw `@scope`-wrapped
rule block, `layers` is the same content re-wrapped in
`@layer czap.components { … }` with any boundary `@container` rules
appended, and `startingStyle` is an `@starting-style` block derived from
the base layer for entry animations.

## Properties

### layers

> `readonly` **layers**: `string`

Defined in: [compiler/src/style-css.ts:34](https://github.com/heyoub/LiteShip/blob/main/packages/compiler/src/style-css.ts#L34)

`@layer czap.components { … }` block including container queries.

***

### scoped

> `readonly` **scoped**: `string`

Defined in: [compiler/src/style-css.ts:32](https://github.com/heyoub/LiteShip/blob/main/packages/compiler/src/style-css.ts#L32)

`@scope`-wrapped rule block (or plain rules when no component name).

***

### startingStyle

> `readonly` **startingStyle**: `string`

Defined in: [compiler/src/style-css.ts:36](https://github.com/heyoub/LiteShip/blob/main/packages/compiler/src/style-css.ts#L36)

`@starting-style { … }` block for entry animations (may be empty).
