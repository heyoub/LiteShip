[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [compiler/src](../README.md) / GLSLCompileResult

# Interface: GLSLCompileResult

Defined in: [compiler/src/glsl.ts:63](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/compiler/src/glsl.ts#L63)

Output of [GLSLCompiler.compile](../variables/GLSLCompiler.md#compile).

`declarations` is the complete preamble block ready to prepend to a
shader; `bindUniforms` is a `function bindUniforms(gl, program, values)`
stringified helper that routes the values map into `uniform*` calls.

## Properties

### bindUniforms

> `readonly` **bindUniforms**: `string`

Defined in: [compiler/src/glsl.ts:73](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/compiler/src/glsl.ts#L73)

Stringified `bindUniforms(gl, program, values)` helper.

***

### declarations

> `readonly` **declarations**: `string`

Defined in: [compiler/src/glsl.ts:71](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/compiler/src/glsl.ts#L71)

Pre-serialized `#define` + `uniform` declarations block.

***

### defines

> `readonly` **defines**: readonly [`GLSLDefine`](GLSLDefine.md)[]

Defined in: [compiler/src/glsl.ts:65](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/compiler/src/glsl.ts#L65)

State-index `#define`s.

***

### uniforms

> `readonly` **uniforms**: readonly [`GLSLUniform`](GLSLUniform.md)[]

Defined in: [compiler/src/glsl.ts:67](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/compiler/src/glsl.ts#L67)

Uniform declarations, including the `u_state` index uniform.

***

### uniformValues

> `readonly` **uniformValues**: `Record`\<`string`, `number`\>

Defined in: [compiler/src/glsl.ts:69](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/compiler/src/glsl.ts#L69)

Default uniform values keyed by uniform name (from the last state's values).
