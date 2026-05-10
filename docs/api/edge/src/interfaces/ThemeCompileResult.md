[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [edge/src](../README.md) / ThemeCompileResult

# Interface: ThemeCompileResult

Defined in: edge/src/theme-compiler.ts:38

Output of [compileTheme](../functions/compileTheme.md).

Provides three views of the same declarations: structured, a full CSS
rule, and an inline-style string — so hosts can pick whichever
serialization best fits their HTML injection strategy.

## Properties

### css

> `readonly` **css**: `string`

Defined in: edge/src/theme-compiler.ts:42

Full CSS rule with custom property declarations inside `:root {}`.

***

### declarations

> `readonly` **declarations**: readonly `ThemeDeclaration`[]

Defined in: edge/src/theme-compiler.ts:40

Structured declarations suitable for serializer-specific output.

***

### inlineStyle

> `readonly` **inlineStyle**: `string`

Defined in: edge/src/theme-compiler.ts:44

Inline style string for `<html style="...">` injection.
