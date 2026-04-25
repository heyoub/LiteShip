[**czap**](../../../README.md)

***

[czap](../../../README.md) / [vite/src](../README.md) / parseTokenBlocks

# Function: parseTokenBlocks()

> **parseTokenBlocks**(`css`, `sourceFile`): readonly [`TokenBlock`](../interfaces/TokenBlock.md)[]

Defined in: [vite/src/token-transform.ts:47](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/vite/src/token-transform.ts#L47)

Parse every `@token` block from CSS source text.

Grammar:

```css
@token name {
  property: value;
}
```

## Parameters

### css

`string`

### sourceFile

`string`

## Returns

readonly [`TokenBlock`](../interfaces/TokenBlock.md)[]
