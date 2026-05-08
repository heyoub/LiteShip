[**czap**](../../../README.md)

***

[czap](../../../README.md) / [vite/src](../README.md) / QuantizeBlock

# Interface: QuantizeBlock

Defined in: [vite/src/css-quantize.ts:24](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/vite/src/css-quantize.ts#L24)

A single parsed `@quantize` block: the boundary being quantised, the
per-state property bag, and provenance info so HMR can emit
source-mapped warnings.

## Properties

### boundaryName

> `readonly` **boundaryName**: `string`

Defined in: [vite/src/css-quantize.ts:26](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/vite/src/css-quantize.ts#L26)

Boundary name referenced in the at-rule preamble.

***

### line

> `readonly` **line**: `number`

Defined in: [vite/src/css-quantize.ts:32](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/vite/src/css-quantize.ts#L32)

1-based source line where the block begins.

***

### sourceFile

> `readonly` **sourceFile**: `string`

Defined in: [vite/src/css-quantize.ts:30](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/vite/src/css-quantize.ts#L30)

Absolute path of the CSS source file.

***

### states

> `readonly` **states**: `Record`\<`string`, `Record`\<`string`, `string`\>\>

Defined in: [vite/src/css-quantize.ts:28](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/vite/src/css-quantize.ts#L28)

`{ stateName: { cssProp: value } }` mapping.
