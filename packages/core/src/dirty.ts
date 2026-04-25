/**
 * DirtyFlags -- bitmask dirty tracking.
 *
 * Maps string keys to bit positions in a 32-bit integer mask,
 * enabling O(1) mark/clear/check operations for change tracking.
 *
 * @module
 */

import { DIRTY_FLAGS_MAX } from './defaults.js';

interface DirtyFlagsShape<K extends string = string> {
  mark(key: K): void;
  clear(key: K): void;
  clearAll(): void;
  isDirty(key: K): boolean;
  getDirty(): readonly K[];
  readonly mask: number;
}

/**
 * Creates a bitmask-based dirty tracker for the given keys (max 31).
 * Enables O(1) mark, clear, and check operations for change tracking.
 *
 * @example
 * ```ts
 * const flags = DirtyFlags.make(['position', 'color', 'opacity'] as const);
 * flags.mark('position');
 * flags.mark('color');
 * flags.isDirty('position'); // true
 * flags.isDirty('opacity');  // false
 * flags.getDirty();          // ['position', 'color']
 * flags.clearAll();
 * flags.mask;                // 0
 * ```
 */
function _make<K extends string>(keys: readonly K[]): DirtyFlagsShape<K> {
  if (keys.length > DIRTY_FLAGS_MAX) {
    throw new RangeError(`DirtyFlags supports at most ${DIRTY_FLAGS_MAX} keys, got ${keys.length}`);
  }

  const bitMap = new Map<K, number>();
  keys.forEach((key, i) => {
    bitMap.set(key, 1 << i);
  });

  let mask = 0;

  return {
    mark(key: K): void {
      const bit = bitMap.get(key);
      if (bit !== undefined) mask |= bit;
    },

    clear(key: K): void {
      const bit = bitMap.get(key);
      if (bit !== undefined) mask &= ~bit;
    },

    clearAll(): void {
      mask = 0;
    },

    isDirty(key: K): boolean {
      const bit = bitMap.get(key);
      return bit !== undefined ? (mask & bit) !== 0 : false;
    },

    getDirty(): readonly K[] {
      const dirty: K[] = [];
      for (const [key, bit] of bitMap) {
        if ((mask & bit) !== 0) dirty.push(key);
      }
      return dirty;
    },

    get mask(): number {
      return mask;
    },
  };
}

/**
 * DirtyFlags -- bitmask-based dirty tracking for up to 31 named keys.
 * O(1) mark/clear/check operations using bitwise integer operations.
 *
 * @example
 * ```ts
 * const flags = DirtyFlags.make(['transform', 'style'] as const);
 * flags.mark('transform');
 * flags.isDirty('transform'); // true
 * flags.clear('transform');
 * flags.isDirty('transform'); // false
 * ```
 */
export const DirtyFlags = { make: _make };

export declare namespace DirtyFlags {
  /** Structural shape of a {@link DirtyFlags} instance keyed by flag name `K`. */
  export type Shape<K extends string = string> = DirtyFlagsShape<K>;
}
