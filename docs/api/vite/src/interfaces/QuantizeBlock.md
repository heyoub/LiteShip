[**czap**](../../../README.md)

***

[czap](../../../README.md) / [vite/src](../README.md) / QuantizeBlock

# Interface: QuantizeBlock

Defined in: [vite/src/css-quantize.ts:23](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/vite/src/css-quantize.ts#L23)

A single parsed `@quantize` block: the boundary being quantised, the
per-state property bag, and provenance info so HMR can emit
source-mapped warnings.

## Properties

### boundaryName

> `readonly` **boundaryName**: `string`

Defined in: [vite/src/css-quantize.ts:25](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/vite/src/css-quantize.ts#L25)

Boundary name referenced in the at-rule preamble.

***

### line

> `readonly` **line**: `number`

Defined in: [vite/src/css-quantize.ts:31](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/vite/src/css-quantize.ts#L31)

1-based source line where the block begins.

***

### sourceFile

> `readonly` **sourceFile**: `string`

Defined in: [vite/src/css-quantize.ts:29](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/vite/src/css-quantize.ts#L29)

Absolute path of the CSS source file.

***

### states

> `readonly` **states**: `Record`\<`string`, `Record`\<`string`, `string`\>\>

Defined in: [vite/src/css-quantize.ts:27](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/vite/src/css-quantize.ts#L27)

`{ stateName: { cssProp: value } }` mapping.
