[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [vite/src](../README.md) / TokenBlock

# Interface: TokenBlock

Defined in: [vite/src/token-transform.ts:22](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/vite/src/token-transform.ts#L22)

Parsed `@token` block: the token to emit and any inline overrides.

## Properties

### declarations

> `readonly` **declarations**: `Record`\<`string`, `string`\>

Defined in: [vite/src/token-transform.ts:26](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/vite/src/token-transform.ts#L26)

Inline overrides (`{ cssProp: value }`).

***

### line

> `readonly` **line**: `number`

Defined in: [vite/src/token-transform.ts:30](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/vite/src/token-transform.ts#L30)

1-based line where the block begins.

***

### sourceFile

> `readonly` **sourceFile**: `string`

Defined in: [vite/src/token-transform.ts:28](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/vite/src/token-transform.ts#L28)

Absolute source file path.

***

### tokenName

> `readonly` **tokenName**: `string`

Defined in: [vite/src/token-transform.ts:24](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/vite/src/token-transform.ts#L24)

Named token (resolved against exported `TokenDef` values).
