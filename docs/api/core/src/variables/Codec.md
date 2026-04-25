[**czap**](../../../README.md)

***

[czap](../../../README.md) / [core/src](../README.md) / Codec

# Variable: Codec

> `const` **Codec**: `object`

Defined in: [core/src/codec.ts:31](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/codec.ts#L31)

Codec — typed encode/decode wrapper over `effect`'s `Schema.Codec`.
Gives a single call site for schema-driven validation so consumers don't
import `Schema.encodeEffect`/`decodeEffect` directly.

## Type Declaration

### make

> **make**: \<`A`, `I`\>(`schema`) => `CodecShape`\<`A`, `I`\> = `_make`

Wrap a `Schema.Codec` in the [Codec.Shape](../namespaces/Codec/type-aliases/Shape.md) facade.

#### Type Parameters

##### A

`A`

##### I

`I`

#### Parameters

##### schema

`Codec`\<`A`, `I`\>

#### Returns

`CodecShape`\<`A`, `I`\>
