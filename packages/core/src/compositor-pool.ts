/**
 * CompositorStatePool -- ring buffer of pre-allocated CompositeState objects.
 *
 * The compositor grabs one, writes into it, hands it to the renderer,
 * which returns it after DOM application. Zero-allocation hot path.
 *
 * @module
 */

import type { CompositeState } from './compositor.js';
import { COMPOSITOR_POOL_CAP } from './defaults.js';

// Zero-allocation ring buffer: pre-allocated fixed-size pool with index-wrapping reads/writes. No GC pressure on hot path.

interface CompositorStatePoolShape {
  acquire(): CompositeState;
  release(state: CompositeState): void;
  readonly size: number;
  readonly available: number;
}

/**
 * Mutable views into a CompositeState's fields. `CompositeState` declares
 * its fields as `readonly Record<...>`, but the compositor and the pool
 * both need to mutate those records in place for the zero-allocation
 * hot path. This helper centralises the single cast that strips
 * `readonly` so callers can stay type-safe without re-casting at each
 * write site.
 */
export interface MutableCompositeStateViews {
  readonly discrete: Record<string, string>;
  readonly blend: Record<string, Record<string, number>>;
  readonly css: Record<string, number | string>;
  readonly glsl: Record<string, number>;
  readonly aria: Record<string, string>;
}

type MutableCompositeState = {
  -readonly [K in keyof CompositeState]: CompositeState[K] extends Readonly<infer U> ? U : CompositeState[K];
} & {
  outputs: {
    -readonly [K in keyof CompositeState['outputs']]: CompositeState['outputs'][K];
  };
};

/**
 * Expose the inner `Record<…>`s of a {@link CompositeState} as mutable views
 * for the zero-allocation hot path. Single sanctioned site that strips
 * `readonly` — do not cast at other call sites.
 */
export function accessCompositeState(state: CompositeState): MutableCompositeStateViews {
  const mutable = state as MutableCompositeState;
  return {
    discrete: mutable.discrete,
    blend: mutable.blend,
    css: mutable.outputs.css,
    glsl: mutable.outputs.glsl,
    aria: mutable.outputs.aria,
  };
}

function createMutableState(): CompositeState {
  return {
    discrete: {},
    blend: {},
    outputs: { css: {}, glsl: {}, aria: {} },
  };
}

function resetState(state: CompositeState): void {
  // Clear all fields in-place (cheaper than allocation)
  const { discrete, blend, css, glsl, aria } = accessCompositeState(state);
  for (const k of Object.keys(discrete)) delete discrete[k];
  for (const k of Object.keys(blend)) delete blend[k];
  for (const k of Object.keys(css)) delete css[k];
  for (const k of Object.keys(glsl)) delete glsl[k];
  for (const k of Object.keys(aria)) delete aria[k];
}

/**
 * Creates a ring-buffer pool of pre-allocated CompositeState objects.
 * Acquire/release pattern avoids GC allocations on the hot render path.
 * Default 8 slots -- enough for typical compositor with 4-6 quantizers + headroom.
 *
 * @example
 * ```ts
 * const pool = CompositorStatePool.make(4);
 * const state = pool.acquire();
 * state.discrete['theme'] = 'dark';
 * state.outputs.css['--bg'] = '#000';
 * pool.release(state); // resets and returns to pool
 * pool.available; // 4
 * ```
 */
function _make(capacity = COMPOSITOR_POOL_CAP): CompositorStatePoolShape {
  const buffer: CompositeState[] = [];
  for (let i = 0; i < capacity; i++) {
    buffer.push(createMutableState());
  }

  const free: boolean[] = new Array(capacity).fill(true);
  let acquirePtr = 0;

  return {
    acquire(): CompositeState {
      // Scan from current pointer for a free slot
      for (let i = 0; i < capacity; i++) {
        const idx = (acquirePtr + i) % capacity;
        if (free[idx]) {
          free[idx] = false;
          acquirePtr = (idx + 1) % capacity;
          return buffer[idx]!;
        }
      }
      // All slots in use — allocate overflow (cold path)
      const overflow = createMutableState();
      buffer.push(overflow);
      free.push(false);
      return overflow;
    },

    release(state: CompositeState): void {
      const idx = buffer.indexOf(state);
      if (idx !== -1) {
        resetState(state);
        free[idx] = true;
      }
    },

    get size(): number {
      return buffer.length;
    },

    get available(): number {
      let count = 0;
      for (let i = 0; i < free.length; i++) {
        if (free[i]) count++;
      }
      return count;
    },
  };
}

/**
 * CompositorStatePool -- ring buffer of pre-allocated CompositeState objects.
 * Zero-allocation hot path: acquire a state, write into it, render, then release.
 *
 * @example
 * ```ts
 * const pool = CompositorStatePool.make(8);
 * const state = pool.acquire();
 * // Write compositor output into state.discrete, state.blend, state.outputs
 * pool.release(state); // resets and returns to pool
 * console.log(pool.size, pool.available); // 8, 8
 * ```
 */
export const CompositorStatePool = { make: _make };

export declare namespace CompositorStatePool {
  /** Structural shape of a pool instance: `acquire`, `release`, `size`, `available`. */
  export type Shape = CompositorStatePoolShape;
}
