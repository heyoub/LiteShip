[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [compiler/src](../README.md) / GLSLCompiler

# Variable: GLSLCompiler

> `const` **GLSLCompiler**: `object`

Defined in: [compiler/src/glsl.ts:277](https://github.com/heyoub/LiteShip/blob/main/packages/compiler/src/glsl.ts#L277)

GLSL compiler namespace.

Compiles boundary definitions into GLSL shader preambles containing
`#define` state constants, `uniform` declarations, and a JavaScript
`bindUniforms()` helper for setting uniform values via WebGL.

## Type Declaration

### compile

> **compile**: \<`B`\>(`boundary`, `states`) => [`GLSLCompileResult`](../interfaces/GLSLCompileResult.md)

Compile a boundary definition and per-state numeric value maps into
GLSL `#define` statements, `uniform` declarations, and a `bindUniforms`
helper function string.

#### Type Parameters

##### B

`B` *extends* [`Shape`](#)\<`string`, readonly \[`string`, `string`\]\>

#### Parameters

##### boundary

`B`

The boundary definition with states

##### states

`{ [S in string]: Record<string, number> }`

Per-state numeric value maps

#### Returns

[`GLSLCompileResult`](../interfaces/GLSLCompileResult.md)

A [GLSLCompileResult](../interfaces/GLSLCompileResult.md) with defines, uniforms, and helper code

#### Example

```ts
import { Boundary } from '@czap/core';
import { GLSLCompiler } from '@czap/compiler';

const boundary = Boundary.make({
  input: 'width', states: ['mobile', 'desktop'] as const,
  thresholds: [0, 768],
});
const result = GLSLCompiler.compile(boundary, {
  mobile: { blur: 0.5, brightness: 1.0 },
  desktop: { blur: 0.0, brightness: 1.2 },
});
console.log(result.declarations);
// #define STATE_MOBILE 0
// #define STATE_DESKTOP 1
// uniform int u_state;
// uniform float u_blur;
// uniform float u_brightness;
```

### serialize

> **serialize**: (`result`) => `string`

Serialize a [GLSLCompileResult](../interfaces/GLSLCompileResult.md) into a full GLSL preamble string
including declarations and the `bindUniforms` helper.

#### Parameters

##### result

[`GLSLCompileResult`](../interfaces/GLSLCompileResult.md)

The compile result to serialize

#### Returns

`string`

A GLSL preamble string

#### Example

```ts
import { GLSLCompiler } from '@czap/compiler';

const result = GLSLCompiler.compile(boundary, states);
const glsl = GLSLCompiler.serialize(result);
// Prepend to your fragment shader source
const shaderSource = glsl + '\n' + mainShaderCode;
```

## Example

```ts
import { Boundary } from '@czap/core';
import { GLSLCompiler } from '@czap/compiler';

const boundary = Boundary.make({
  input: 'width', states: ['sm', 'lg'] as const,
  thresholds: [0, 768],
});
const result = GLSLCompiler.compile(boundary, {
  sm: { intensity: 0.5 }, lg: { intensity: 1.0 },
});
const preamble = GLSLCompiler.serialize(result);
```
