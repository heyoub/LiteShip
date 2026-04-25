[**czap**](../../../README.md)

***

[czap](../../../README.md) / [compiler/src](../README.md) / GLSLDefine

# Interface: GLSLDefine

Defined in: [compiler/src/glsl.ts:47](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/compiler/src/glsl.ts#L47)

A single GLSL `#define` produced by [GLSLCompiler.compile](../variables/GLSLCompiler.md#compile).

## Properties

### comment?

> `readonly` `optional` **comment?**: `string`

Defined in: [compiler/src/glsl.ts:53](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/compiler/src/glsl.ts#L53)

Optional inline comment emitted alongside the `#define`.

***

### name

> `readonly` **name**: `string`

Defined in: [compiler/src/glsl.ts:49](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/compiler/src/glsl.ts#L49)

Macro name (`STATE_*` or `STATE_COUNT`).

***

### value

> `readonly` **value**: `string`

Defined in: [compiler/src/glsl.ts:51](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/compiler/src/glsl.ts#L51)

Macro value (always numeric, serialized as a string).
