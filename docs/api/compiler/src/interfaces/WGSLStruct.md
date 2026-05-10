[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [compiler/src](../README.md) / WGSLStruct

# Interface: WGSLStruct

Defined in: compiler/src/wgsl.ts:49

A WGSL `struct { … }` definition produced by [WGSLCompiler.compile](../variables/WGSLCompiler.md#compile).

## Properties

### fields

> `readonly` **fields**: readonly `object`[]

Defined in: compiler/src/wgsl.ts:53

Ordered fields; the first is always `state_index: u32`.

***

### name

> `readonly` **name**: `string`

Defined in: compiler/src/wgsl.ts:51

Struct identifier (PascalCase, suffixed `State`).
