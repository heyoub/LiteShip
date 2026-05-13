[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [core/src](../README.md) / DirtyFlags

# Variable: DirtyFlags

> `const` **DirtyFlags**: `object`

Defined in: [core/src/dirty.ts:96](https://github.com/heyoub/LiteShip/blob/main/packages/core/src/dirty.ts#L96)

DirtyFlags -- bitmask-based dirty tracking for up to 31 named keys.
O(1) mark/clear/check operations using bitwise integer operations.

## Type Declaration

### make

> **make**: \<`K`\>(`keys`) => `DirtyFlagsShape`\<`K`\> = `_make`

Creates a bitmask-based dirty tracker for the given keys (max 31).
Enables O(1) mark, clear, and check operations for change tracking.

#### Type Parameters

##### K

`K` *extends* `string`

#### Parameters

##### keys

readonly `K`[]

#### Returns

`DirtyFlagsShape`\<`K`\>

#### Example

```ts
const flags = DirtyFlags.make(['position', 'color', 'opacity'] as const);
flags.mark('position');
flags.mark('color');
flags.isDirty('position'); // true
flags.isDirty('opacity');  // false
flags.getDirty();          // ['position', 'color']
flags.clearAll();
flags.mask;                // 0
```

## Example

```ts
const flags = DirtyFlags.make(['transform', 'style'] as const);
flags.mark('transform');
flags.isDirty('transform'); // true
flags.clear('transform');
flags.isDirty('transform'); // false
```
