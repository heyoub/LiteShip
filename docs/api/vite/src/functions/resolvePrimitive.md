[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [vite/src](../README.md) / resolvePrimitive

# Function: resolvePrimitive()

> **resolvePrimitive**\<`K`\>(`kind`, `name`, `fromFile`, `projectRoot`, `userDir?`): `Promise`\<[`PrimitiveResolution`](../interfaces/PrimitiveResolution.md)\<`K`\> \| `null`\>

Defined in: [vite/src/primitive-resolve.ts:69](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/vite/src/primitive-resolve.ts#L69)

Resolve a named primitive (boundary / token / theme / style) by
walking the convention-based search order. Returns `null` when no
module exports a matching named value.

## Type Parameters

### K

`K` *extends* [`PrimitiveKind`](../type-aliases/PrimitiveKind.md)

## Parameters

### kind

`K`

Primitive kind to resolve.

### name

`string`

Named export to look up.

### fromFile

`string`

Path of the file that triggered the lookup.

### projectRoot

`string`

Vite project root (search fallback).

### userDir?

`string`

Optional override directory (searched first).

## Returns

`Promise`\<[`PrimitiveResolution`](../interfaces/PrimitiveResolution.md)\<`K`\> \| `null`\>
