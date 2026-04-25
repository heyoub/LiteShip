[**czap**](../../../README.md)

***

[czap](../../../README.md) / [quantizer/src](../README.md) / MemoCache

# Variable: MemoCache

> `const` **MemoCache**: `object`

Defined in: [quantizer/src/memo-cache.ts:50](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/quantizer/src/memo-cache.ts#L50)

Content-address memoization cache.

Keys are [ContentAddress](#) values, so the cache is auto-invalidating:
any change to an upstream definition produces a new hash and a guaranteed
miss. Backed by an unbounded [Map](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map); callers are responsible for
lifetime and eviction if needed.

## Type Declaration

### make

> **make**: \<`V`\>() => `MemoCacheShape`\<`V`\> = `_make`

Construct a fresh cache with value type `V`.

#### Type Parameters

##### V

`V`

#### Returns

`MemoCacheShape`\<`V`\>
