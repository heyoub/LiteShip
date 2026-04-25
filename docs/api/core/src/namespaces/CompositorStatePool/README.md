[**czap**](../../../../README.md)

***

[czap](../../../../README.md) / [core/src](../../README.md) / CompositorStatePool

# CompositorStatePool

CompositorStatePool -- ring buffer of pre-allocated CompositeState objects.
Zero-allocation hot path: acquire a state, write into it, render, then release.

## Example

```ts
const pool = CompositorStatePool.make(8);
const state = pool.acquire();
// Write compositor output into state.discrete, state.blend, state.outputs
pool.release(state); // resets and returns to pool
console.log(pool.size, pool.available); // 8, 8
```

## Type Aliases

- [Shape](type-aliases/Shape.md)
