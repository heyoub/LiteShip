[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [vite/src](../README.md) / PrimitiveShape

# Type Alias: PrimitiveShape\<K\>

> **PrimitiveShape**\<`K`\> = `K` *extends* `"boundary"` ? [`Boundary.Shape`](#) : `K` *extends* `"token"` ? [`Token.Shape`](#) : `K` *extends* `"theme"` ? [`Theme.Shape`](#) : [`Style.Shape`](#)

Defined in: [vite/src/primitive-resolve.ts:31](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/vite/src/primitive-resolve.ts#L31)

Map a [PrimitiveKind](PrimitiveKind.md) to the structural type of the primitive
it resolves (`Boundary.Shape`, `Token.Shape`, ...).

## Type Parameters

### K

`K` *extends* [`PrimitiveKind`](PrimitiveKind.md)
