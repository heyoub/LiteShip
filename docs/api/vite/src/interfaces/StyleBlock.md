[**czap**](../../../README.md)

***

[czap](../../../README.md) / [vite/src](../README.md) / StyleBlock

# Interface: StyleBlock

Defined in: [vite/src/style-transform.ts:23](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/vite/src/style-transform.ts#L23)

Single parsed `@style` block: the style name being referenced, its
per-state CSS property overrides, and provenance.

## Properties

### line

> `readonly` **line**: `number`

Defined in: [vite/src/style-transform.ts:31](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/vite/src/style-transform.ts#L31)

1-based line where the block begins.

***

### sourceFile

> `readonly` **sourceFile**: `string`

Defined in: [vite/src/style-transform.ts:29](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/vite/src/style-transform.ts#L29)

Absolute source file path.

***

### states

> `readonly` **states**: `Record`\<`string`, `Record`\<`string`, `string`\>\>

Defined in: [vite/src/style-transform.ts:27](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/vite/src/style-transform.ts#L27)

`{ stateName: { cssProp: value } }` mapping.

***

### styleName

> `readonly` **styleName**: `string`

Defined in: [vite/src/style-transform.ts:25](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/vite/src/style-transform.ts#L25)

Named style (resolved against exported `StyleDef` values).
