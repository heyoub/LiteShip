[**czap**](../../../../README.md)

***

[czap](../../../../README.md) / [core/src](../../README.md) / DirtyFlags

# DirtyFlags

DirtyFlags -- bitmask-based dirty tracking for up to 31 named keys.
O(1) mark/clear/check operations using bitwise integer operations.

## Example

```ts
const flags = DirtyFlags.make(['transform', 'style'] as const);
flags.mark('transform');
flags.isDirty('transform'); // true
flags.clear('transform');
flags.isDirty('transform'); // false
```

## Type Aliases

- [Shape](type-aliases/Shape.md)
