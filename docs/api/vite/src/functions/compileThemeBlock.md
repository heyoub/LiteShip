[**czap**](../../../README.md)

***

[czap](../../../README.md) / [vite/src](../README.md) / compileThemeBlock

# Function: compileThemeBlock()

> **compileThemeBlock**(`block`, `theme`): `string`

Defined in: [vite/src/theme-transform.ts:100](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/vite/src/theme-transform.ts#L100)

Compile a parsed [ThemeBlock](../interfaces/ThemeBlock.md) plus a resolved `ThemeDef` into
`html[data-theme]` selector blocks and transition declarations.
Delegates to the canonical `ThemeCSSCompiler` to avoid duplicating
theme-to-CSS logic.

## Parameters

### block

[`ThemeBlock`](../interfaces/ThemeBlock.md)

### theme

[`Shape`](#)

## Returns

`string`
