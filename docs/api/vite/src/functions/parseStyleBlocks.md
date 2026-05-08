[**czap**](../../../README.md)

***

[czap](../../../README.md) / [vite/src](../README.md) / parseStyleBlocks

# Function: parseStyleBlocks()

> **parseStyleBlocks**(`css`, `sourceFile`): readonly [`StyleBlock`](../interfaces/StyleBlock.md)[]

Defined in: [vite/src/style-transform.ts:54](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/vite/src/style-transform.ts#L54)

Parse every `@style` block from CSS source text.

Grammar:

```css
@style name {
  stateName {
    property: value;
  }
}
```

Follows the same nested-brace pattern as `@quantize` blocks.

## Parameters

### css

`string`

### sourceFile

`string`

## Returns

readonly [`StyleBlock`](../interfaces/StyleBlock.md)[]
