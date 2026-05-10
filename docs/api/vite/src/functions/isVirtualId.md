[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [vite/src](../README.md) / isVirtualId

# Function: isVirtualId()

> **isVirtualId**(`id`): `boolean`

Defined in: vite/src/virtual-modules.ts:64

Return `true` when `id` is a fully-resolved czap virtual module
(null-byte-prefixed). Callers use this to gate `load` handler
dispatch.

## Parameters

### id

`string`

## Returns

`boolean`
