[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [compiler/src](../README.md) / WGSLBinding

# Interface: WGSLBinding

Defined in: [compiler/src/wgsl.ts:37](https://github.com/heyoub/LiteShip/blob/main/packages/compiler/src/wgsl.ts#L37)

A single `@group(G) @binding(B) var<uniform> …` declaration.

## Properties

### binding

> `readonly` **binding**: `number`

Defined in: [compiler/src/wgsl.ts:41](https://github.com/heyoub/LiteShip/blob/main/packages/compiler/src/wgsl.ts#L41)

Binding index within the group.

***

### group

> `readonly` **group**: `number`

Defined in: [compiler/src/wgsl.ts:39](https://github.com/heyoub/LiteShip/blob/main/packages/compiler/src/wgsl.ts#L39)

Bind group index.

***

### name

> `readonly` **name**: `string`

Defined in: [compiler/src/wgsl.ts:43](https://github.com/heyoub/LiteShip/blob/main/packages/compiler/src/wgsl.ts#L43)

Binding variable name.

***

### type

> `readonly` **type**: `string`

Defined in: [compiler/src/wgsl.ts:45](https://github.com/heyoub/LiteShip/blob/main/packages/compiler/src/wgsl.ts#L45)

Resolved primitive or struct type.
