[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [compiler/src](../README.md) / TokenTailwindCompiler

# Variable: TokenTailwindCompiler

> `const` **TokenTailwindCompiler**: `object`

Defined in: compiler/src/token-tailwind.ts:127

Token Tailwind compiler namespace.

Adapts a `@czap/core` token set to Tailwind v4's CSS-first theming
pipeline by emitting a single `@theme { }` block with the category
prefixes Tailwind expects (`--color-`, `--spacing-`, `--font-`, …).

## Type Declaration

### compile

> **compile**: (`tokens`) => [`TokenTailwindResult`](../interfaces/TokenTailwindResult.md)

Compile a token array into a Tailwind v4 `@theme` block.

Compile a list of [Token.Shape](#) into a Tailwind v4 `@theme` block.

Tokens are grouped by category with a short comment separator so the
generated CSS remains human-readable alongside hand-authored Tailwind.

#### Parameters

##### tokens

readonly [`Shape`](#)\<`string`, readonly `string`[]\>[]

#### Returns

[`TokenTailwindResult`](../interfaces/TokenTailwindResult.md)
