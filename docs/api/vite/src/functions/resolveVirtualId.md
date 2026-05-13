[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [vite/src](../README.md) / resolveVirtualId

# Function: resolveVirtualId()

> **resolveVirtualId**(`id`): `string` \| `undefined`

Defined in: [vite/src/virtual-modules.ts:52](https://github.com/heyoub/LiteShip/blob/main/packages/vite/src/virtual-modules.ts#L52)

Resolve a virtual module ID to its internal null-byte-prefixed form
(as expected by Vite's module graph). Returns `undefined` when `id`
is not a recognised czap virtual module.

## Parameters

### id

`string`

## Returns

`string` \| `undefined`
