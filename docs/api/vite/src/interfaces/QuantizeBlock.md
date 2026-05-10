[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [vite/src](../README.md) / QuantizeBlock

# Interface: QuantizeBlock

Defined in: vite/src/css-quantize.ts:24

A single parsed `@quantize` block: the boundary being quantised, the
per-state property bag, and provenance info so HMR can emit
source-mapped warnings.

## Properties

### boundaryName

> `readonly` **boundaryName**: `string`

Defined in: vite/src/css-quantize.ts:26

Boundary name referenced in the at-rule preamble.

***

### line

> `readonly` **line**: `number`

Defined in: vite/src/css-quantize.ts:32

1-based source line where the block begins.

***

### sourceFile

> `readonly` **sourceFile**: `string`

Defined in: vite/src/css-quantize.ts:30

Absolute path of the CSS source file.

***

### states

> `readonly` **states**: `Record`\<`string`, `Record`\<`string`, `string`\>\>

Defined in: vite/src/css-quantize.ts:28

`{ stateName: { cssProp: value } }` mapping.
