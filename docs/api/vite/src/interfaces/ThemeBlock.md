[**czap**](../../../README.md)

***

[czap](../../../README.md) / [vite/src](../README.md) / ThemeBlock

# Interface: ThemeBlock

Defined in: [vite/src/theme-transform.ts:22](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/vite/src/theme-transform.ts#L22)

Parsed `@theme` block: the theme to apply and any inline token
overrides declared on the block itself.

## Properties

### declarations

> `readonly` **declarations**: `Record`\<`string`, `string`\>

Defined in: [vite/src/theme-transform.ts:26](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/vite/src/theme-transform.ts#L26)

Inline token overrides (`{ tokenName: value }`).

***

### line

> `readonly` **line**: `number`

Defined in: [vite/src/theme-transform.ts:30](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/vite/src/theme-transform.ts#L30)

1-based line where the block begins.

***

### sourceFile

> `readonly` **sourceFile**: `string`

Defined in: [vite/src/theme-transform.ts:28](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/vite/src/theme-transform.ts#L28)

Absolute source file path.

***

### themeName

> `readonly` **themeName**: `string`

Defined in: [vite/src/theme-transform.ts:24](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/vite/src/theme-transform.ts#L24)

Named theme (resolved against exported `ThemeDef` values).
