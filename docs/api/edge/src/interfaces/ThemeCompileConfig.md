[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [edge/src](../README.md) / ThemeCompileConfig

# Interface: ThemeCompileConfig

Defined in: [edge/src/theme-compiler.ts:24](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/edge/src/theme-compiler.ts#L24)

Input to [compileTheme](../functions/compileTheme.md).

Tokens are flat key/value pairs — nested paths like `color.primary` are
sanitized into CSS-safe custom property names. Numeric values are emitted
bare so consumers can apply their own units downstream.

## Properties

### prefix?

> `readonly` `optional` **prefix?**: `string`

Defined in: [edge/src/theme-compiler.ts:28](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/edge/src/theme-compiler.ts#L28)

CSS custom property prefix. Defaults to `'czap'`.

***

### tokens

> `readonly` **tokens**: `Readonly`\<`Record`\<`string`, `string` \| `number`\>\>

Defined in: [edge/src/theme-compiler.ts:26](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/edge/src/theme-compiler.ts#L26)

Flat map of token name to value (string or numeric).
