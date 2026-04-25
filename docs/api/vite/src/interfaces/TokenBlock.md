[**czap**](../../../README.md)

***

[czap](../../../README.md) / [vite/src](../README.md) / TokenBlock

# Interface: TokenBlock

Defined in: [vite/src/token-transform.ts:21](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/vite/src/token-transform.ts#L21)

Parsed `@token` block: the token to emit and any inline overrides.

## Properties

### declarations

> `readonly` **declarations**: `Record`\<`string`, `string`\>

Defined in: [vite/src/token-transform.ts:25](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/vite/src/token-transform.ts#L25)

Inline overrides (`{ cssProp: value }`).

***

### line

> `readonly` **line**: `number`

Defined in: [vite/src/token-transform.ts:29](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/vite/src/token-transform.ts#L29)

1-based line where the block begins.

***

### sourceFile

> `readonly` **sourceFile**: `string`

Defined in: [vite/src/token-transform.ts:27](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/vite/src/token-transform.ts#L27)

Absolute source file path.

***

### tokenName

> `readonly` **tokenName**: `string`

Defined in: [vite/src/token-transform.ts:23](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/vite/src/token-transform.ts#L23)

Named token (resolved against exported `TokenDef` values).
