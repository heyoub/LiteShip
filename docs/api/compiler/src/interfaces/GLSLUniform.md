[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [compiler/src](../README.md) / GLSLUniform

# Interface: GLSLUniform

Defined in: [compiler/src/glsl.ts:37](https://github.com/heyoub/LiteShip/blob/main/packages/compiler/src/glsl.ts#L37)

A single GLSL uniform declaration produced by [GLSLCompiler.compile](../variables/GLSLCompiler.md#compile).

## Properties

### comment?

> `readonly` `optional` **comment?**: `string`

Defined in: [compiler/src/glsl.ts:43](https://github.com/heyoub/LiteShip/blob/main/packages/compiler/src/glsl.ts#L43)

Optional inline comment emitted alongside the declaration.

***

### name

> `readonly` **name**: `string`

Defined in: [compiler/src/glsl.ts:39](https://github.com/heyoub/LiteShip/blob/main/packages/compiler/src/glsl.ts#L39)

Uniform name (prefixed `u_`, snake-case).

***

### type

> `readonly` **type**: [`GLSLType`](../type-aliases/GLSLType.md)

Defined in: [compiler/src/glsl.ts:41](https://github.com/heyoub/LiteShip/blob/main/packages/compiler/src/glsl.ts#L41)

Inferred GLSL type; float when any state value is non-integer or negative.
