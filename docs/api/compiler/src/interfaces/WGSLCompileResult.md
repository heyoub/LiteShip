[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [compiler/src](../README.md) / WGSLCompileResult

# Interface: WGSLCompileResult

Defined in: compiler/src/wgsl.ts:62

Output of [WGSLCompiler.compile](../variables/WGSLCompiler.md#compile).

`declarations` is the ready-to-prepend WGSL preamble containing state
constants, the uniform struct, and its binding declaration.

## Properties

### bindings

> `readonly` **bindings**: readonly [`WGSLBinding`](WGSLBinding.md)[]

Defined in: compiler/src/wgsl.ts:66

Uniform buffer bindings.

***

### bindingValues

> `readonly` **bindingValues**: `Record`\<`string`, `number`\>

Defined in: compiler/src/wgsl.ts:68

Default field values keyed by WGSL field name.

***

### declarations

> `readonly` **declarations**: `string`

Defined in: compiler/src/wgsl.ts:70

Pre-serialized WGSL preamble string.

***

### structs

> `readonly` **structs**: readonly [`WGSLStruct`](WGSLStruct.md)[]

Defined in: compiler/src/wgsl.ts:64

Declared struct types (currently one: the boundary's state struct).
