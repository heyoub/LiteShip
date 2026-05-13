[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [compiler/src](../README.md) / TokenTailwindResult

# Interface: TokenTailwindResult

Defined in: [compiler/src/token-tailwind.ts:24](https://github.com/heyoub/LiteShip/blob/main/packages/compiler/src/token-tailwind.ts#L24)

Output of [TokenTailwindCompiler.compile](../variables/TokenTailwindCompiler.md#compile).

Tailwind v4's CSS-first pipeline consumes the emitted `@theme { }` block
verbatim; there are no structured side outputs because Tailwind only
needs the declarations text.

## Properties

### themeBlock

> `readonly` **themeBlock**: `string`

Defined in: [compiler/src/token-tailwind.ts:26](https://github.com/heyoub/LiteShip/blob/main/packages/compiler/src/token-tailwind.ts#L26)

Complete `@theme { … }` block ready for a Tailwind v4 entry CSS file.
