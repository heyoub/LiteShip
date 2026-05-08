[**czap**](../../../README.md)

***

[czap](../../../README.md) / [vite/src](../README.md) / ThemeBlock

# Interface: ThemeBlock

Defined in: [vite/src/theme-transform.ts:23](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/vite/src/theme-transform.ts#L23)

Parsed `@theme` block: the theme to apply and any inline token
overrides declared on the block itself.

## Properties

### declarations

> `readonly` **declarations**: `Record`\<`string`, `string`\>

Defined in: [vite/src/theme-transform.ts:27](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/vite/src/theme-transform.ts#L27)

Inline token overrides (`{ tokenName: value }`).

***

### line

> `readonly` **line**: `number`

Defined in: [vite/src/theme-transform.ts:31](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/vite/src/theme-transform.ts#L31)

1-based line where the block begins.

***

### sourceFile

> `readonly` **sourceFile**: `string`

Defined in: [vite/src/theme-transform.ts:29](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/vite/src/theme-transform.ts#L29)

Absolute source file path.

***

### themeName

> `readonly` **themeName**: `string`

Defined in: [vite/src/theme-transform.ts:25](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/vite/src/theme-transform.ts#L25)

Named theme (resolved against exported `ThemeDef` values).
