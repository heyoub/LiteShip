[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [vite/src](../README.md) / PrimitiveResolution

# Interface: PrimitiveResolution\<K\>

Defined in: [vite/src/primitive-resolve.ts:41](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/vite/src/primitive-resolve.ts#L41)

A successful primitive resolution: the loaded primitive plus the
absolute path of the module it came from (surfaced in diagnostics).

## Type Parameters

### K

`K` *extends* [`PrimitiveKind`](../type-aliases/PrimitiveKind.md)

## Properties

### primitive

> `readonly` **primitive**: [`PrimitiveShape`](../type-aliases/PrimitiveShape.md)\<`K`\>

Defined in: [vite/src/primitive-resolve.ts:42](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/vite/src/primitive-resolve.ts#L42)

***

### source

> `readonly` **source**: `string`

Defined in: [vite/src/primitive-resolve.ts:43](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/vite/src/primitive-resolve.ts#L43)
