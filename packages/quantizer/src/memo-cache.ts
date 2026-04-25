/**
 * MemoCache -- content-address memoization layer.
 *
 * Boundaries and quantizer configs are already content-addressed via FNV-1a.
 * This cache ensures identical configs never recompute. Content-addressed keys
 * mean the cache is auto-invalidating: change definition → hash changes → miss.
 *
 * @module
 */

import type { ContentAddress } from '@czap/core';

interface MemoCacheShape<V> {
  get(key: ContentAddress): V | undefined;
  set(key: ContentAddress, value: V): void;
  has(key: ContentAddress): boolean;
  readonly size: number;
}

function _make<V>(): MemoCacheShape<V> {
  const store = new Map<ContentAddress, V>();

  return {
    get(key: ContentAddress): V | undefined {
      return store.get(key);
    },

    set(key: ContentAddress, value: V): void {
      store.set(key, value);
    },

    has(key: ContentAddress): boolean {
      return store.has(key);
    },

    get size(): number {
      return store.size;
    },
  };
}

/**
 * Content-address memoization cache.
 *
 * Keys are {@link ContentAddress} values, so the cache is auto-invalidating:
 * any change to an upstream definition produces a new hash and a guaranteed
 * miss. Backed by an unbounded {@link Map}; callers are responsible for
 * lifetime and eviction if needed.
 */
export const MemoCache = {
  /** Construct a fresh cache with value type `V`. */
  make: _make,
};

export declare namespace MemoCache {
  /** Structural shape of a {@link MemoCache} with value type `V`. */
  export type Shape<V> = MemoCacheShape<V>;
}
