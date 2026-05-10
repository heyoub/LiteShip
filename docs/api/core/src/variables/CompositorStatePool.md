[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [core/src](../README.md) / CompositorStatePool

# Variable: CompositorStatePool

> `const` **CompositorStatePool**: `object`

Defined in: [core/src/compositor-pool.ts:157](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/compositor-pool.ts#L157)

CompositorStatePool -- ring buffer of pre-allocated CompositeState objects.
Zero-allocation hot path: acquire a state, write into it, render, then release.

## Type Declaration

### make

> **make**: (`capacity`) => `CompositorStatePoolShape` = `_make`

Creates a ring-buffer pool of pre-allocated CompositeState objects.
Acquire/release pattern avoids GC allocations on the hot render path.
Default 8 slots -- enough for typical compositor with 4-6 quantizers + headroom.

#### Parameters

##### capacity?

`number` = `COMPOSITOR_POOL_CAP`

#### Returns

`CompositorStatePoolShape`

#### Example

```ts
const pool = CompositorStatePool.make(4);
const state = pool.acquire();
state.discrete['theme'] = 'dark';
state.outputs.css['--bg'] = '#000';
pool.release(state); // resets and returns to pool
pool.available; // 4
```

## Example

```ts
const pool = CompositorStatePool.make(8);
const state = pool.acquire();
// Write compositor output into state.discrete, state.blend, state.outputs
pool.release(state); // resets and returns to pool
console.log(pool.size, pool.available); // 8, 8
```
