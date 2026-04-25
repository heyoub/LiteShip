[**czap**](../../../../README.md)

***

[czap](../../../../README.md) / [quantizer/src](../../README.md) / MemoCache

# MemoCache

Content-address memoization cache.

Keys are [ContentAddress](#) values, so the cache is auto-invalidating:
any change to an upstream definition produces a new hash and a guaranteed
miss. Backed by an unbounded [Map](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map); callers are responsible for
lifetime and eviction if needed.

## Type Aliases

- [Shape](type-aliases/Shape.md)
