[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [compiler/src](../README.md) / GLSLDefine

# Interface: GLSLDefine

Defined in: compiler/src/glsl.ts:47

A single GLSL `#define` produced by [GLSLCompiler.compile](../variables/GLSLCompiler.md#compile).

## Properties

### comment?

> `readonly` `optional` **comment?**: `string`

Defined in: compiler/src/glsl.ts:53

Optional inline comment emitted alongside the `#define`.

***

### name

> `readonly` **name**: `string`

Defined in: compiler/src/glsl.ts:49

Macro name (`STATE_*` or `STATE_COUNT`).

***

### value

> `readonly` **value**: `string`

Defined in: compiler/src/glsl.ts:51

Macro value (always numeric, serialized as a string).
