[**czap**](../../../README.md)

***

[czap](../../../README.md) / [vite/src](../README.md) / parseThemeBlocks

# Function: parseThemeBlocks()

> **parseThemeBlocks**(`css`, `sourceFile`): readonly [`ThemeBlock`](../interfaces/ThemeBlock.md)[]

Defined in: [vite/src/theme-transform.ts:49](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/vite/src/theme-transform.ts#L49)

Parse every `@theme` block from CSS source text.

Grammar:

```css
@theme name {
  tokenName: value;
}
```

## Parameters

### css

`string`

### sourceFile

`string`

## Returns

readonly [`ThemeBlock`](../interfaces/ThemeBlock.md)[]
