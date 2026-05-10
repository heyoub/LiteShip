[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [core/src](../README.md) / TokenBuffer

# Variable: TokenBuffer

> `const` **TokenBuffer**: `object`

Defined in: [core/src/token-buffer.ts:141](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/token-buffer.ts#L141)

TokenBuffer — zero-alloc ring buffer that absorbs bursty LLM token arrival
and hands tokens out at a smooth cadence. Reports stall via `isStalled`
and rate via an internal EMA.

## Type Declaration

### make

> **make**: \<`T`\>(`config?`) => `TokenBufferShape`\<`T`\> = `_make`

Build a new buffer — pass capacity or reuse defaults.

#### Type Parameters

##### T

`T` = `string`

#### Parameters

##### config?

`TokenBufferConfig`

#### Returns

`TokenBufferShape`\<`T`\>
