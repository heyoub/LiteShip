[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [vite/src](../README.md) / parseQuantizeBlocks

# Function: parseQuantizeBlocks()

> **parseQuantizeBlocks**(`css`, `sourceFile`): readonly [`QuantizeBlock`](../interfaces/QuantizeBlock.md)[]

Defined in: [vite/src/css-quantize.ts:202](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/vite/src/css-quantize.ts#L202)

Parse every `@quantize` block from CSS source text.

Grammar:

```css
@quantize boundaryName {
  stateName {
    property: value;
  }
}
```

The outer `@quantize` and state-name matching is line-based for
simplicity; property declarations inside state blocks use a
character-level parser so that multi-line values (e.g.
`linear-gradient` spread across lines) are collected correctly
before being matched.

## Parameters

### css

`string`

### sourceFile

`string`

## Returns

readonly [`QuantizeBlock`](../interfaces/QuantizeBlock.md)[]
