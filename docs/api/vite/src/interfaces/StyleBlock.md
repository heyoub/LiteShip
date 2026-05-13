[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [vite/src](../README.md) / StyleBlock

# Interface: StyleBlock

Defined in: [vite/src/style-transform.ts:24](https://github.com/heyoub/LiteShip/blob/main/packages/vite/src/style-transform.ts#L24)

Single parsed `@style` block: the style name being referenced, its
per-state CSS property overrides, and provenance.

## Properties

### line

> `readonly` **line**: `number`

Defined in: [vite/src/style-transform.ts:32](https://github.com/heyoub/LiteShip/blob/main/packages/vite/src/style-transform.ts#L32)

1-based line where the block begins.

***

### sourceFile

> `readonly` **sourceFile**: `string`

Defined in: [vite/src/style-transform.ts:30](https://github.com/heyoub/LiteShip/blob/main/packages/vite/src/style-transform.ts#L30)

Absolute source file path.

***

### states

> `readonly` **states**: `Record`\<`string`, `Record`\<`string`, `string`\>\>

Defined in: [vite/src/style-transform.ts:28](https://github.com/heyoub/LiteShip/blob/main/packages/vite/src/style-transform.ts#L28)

`{ stateName: { cssProp: value } }` mapping.

***

### styleName

> `readonly` **styleName**: `string`

Defined in: [vite/src/style-transform.ts:26](https://github.com/heyoub/LiteShip/blob/main/packages/vite/src/style-transform.ts#L26)

Named style (resolved against exported `StyleDef` values).
