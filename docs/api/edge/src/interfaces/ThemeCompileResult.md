[**czap**](../../../README.md)

***

[czap](../../../README.md) / [edge/src](../README.md) / ThemeCompileResult

# Interface: ThemeCompileResult

Defined in: [edge/src/theme-compiler.ts:38](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/edge/src/theme-compiler.ts#L38)

Output of [compileTheme](../functions/compileTheme.md).

Provides three views of the same declarations: structured, a full CSS
rule, and an inline-style string — so hosts can pick whichever
serialization best fits their HTML injection strategy.

## Properties

### css

> `readonly` **css**: `string`

Defined in: [edge/src/theme-compiler.ts:42](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/edge/src/theme-compiler.ts#L42)

Full CSS rule with custom property declarations inside `:root {}`.

***

### declarations

> `readonly` **declarations**: readonly `ThemeDeclaration`[]

Defined in: [edge/src/theme-compiler.ts:40](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/edge/src/theme-compiler.ts#L40)

Structured declarations suitable for serializer-specific output.

***

### inlineStyle

> `readonly` **inlineStyle**: `string`

Defined in: [edge/src/theme-compiler.ts:44](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/edge/src/theme-compiler.ts#L44)

Inline style string for `<html style="...">` injection.
