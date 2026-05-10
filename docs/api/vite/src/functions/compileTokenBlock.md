[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [vite/src](../README.md) / compileTokenBlock

# Function: compileTokenBlock()

> **compileTokenBlock**(`block`, `token`): `string`

Defined in: [vite/src/token-transform.ts:98](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/vite/src/token-transform.ts#L98)

Compile a parsed [TokenBlock](../interfaces/TokenBlock.md) plus a resolved `TokenDef` into
CSS custom property declarations. Delegates to the canonical
`TokenCSSCompiler` to avoid duplicating token-to-CSS logic.

## Parameters

### block

[`TokenBlock`](../interfaces/TokenBlock.md)

### token

[`Shape`](#)

## Returns

`string`
