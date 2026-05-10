[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [edge/src](../README.md) / compileTheme

# Function: compileTheme()

> **compileTheme**(`config`): [`ThemeCompileResult`](../interfaces/ThemeCompileResult.md)

Defined in: [edge/src/theme-compiler.ts:123](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/edge/src/theme-compiler.ts#L123)

Compile a set of design tokens into CSS custom property declarations.

## Parameters

### config

[`ThemeCompileConfig`](../interfaces/ThemeCompileConfig.md)

Token definitions and optional prefix.

## Returns

[`ThemeCompileResult`](../interfaces/ThemeCompileResult.md)

CSS string and inline style string.

## Example

```ts
const result = compileTheme({
  tokens: { 'color.primary': '#3b82f6', 'spacing.base': 16 },
  prefix: 'czap',
});
// result.css =>
//   :root {
//     --czap-color-primary: #3b82f6;
//     --czap-spacing-base: 16;
//   }
// result.inlineStyle =>
//   --czap-color-primary:#3b82f6;--czap-spacing-base:16
```
