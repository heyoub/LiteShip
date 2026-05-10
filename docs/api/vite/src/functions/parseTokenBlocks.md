[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [vite/src](../README.md) / parseTokenBlocks

# Function: parseTokenBlocks()

> **parseTokenBlocks**(`css`, `sourceFile`): readonly [`TokenBlock`](../interfaces/TokenBlock.md)[]

Defined in: vite/src/token-transform.ts:48

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
