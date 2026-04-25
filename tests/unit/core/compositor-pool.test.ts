/**
 * CompositorStatePool -- acquire/release/reuse/capacity tests.
 */

import { describe, test, expect } from 'vitest';
import { CompositorStatePool } from '@czap/core';

describe('CompositorStatePool', () => {
  test('make creates pool with default capacity', () => {
    const pool = CompositorStatePool.make();
    expect(pool.size).toBe(8);
    expect(pool.available).toBe(8);
  });

  test('make creates pool with custom capacity', () => {
    const pool = CompositorStatePool.make(4);
    expect(pool.size).toBe(4);
    expect(pool.available).toBe(4);
  });

  test('acquire returns a CompositeState with empty fields', () => {
    const pool = CompositorStatePool.make(2);
    const state = pool.acquire();
    expect(state).toBeDefined();
    expect(state.discrete).toEqual({});
    expect(state.blend).toEqual({});
    expect(state.outputs.css).toEqual({});
    expect(state.outputs.glsl).toEqual({});
    expect(state.outputs.aria).toEqual({});
  });

  test('acquire decrements available count', () => {
    const pool = CompositorStatePool.make(4);
    expect(pool.available).toBe(4);
    pool.acquire();
    expect(pool.available).toBe(3);
    pool.acquire();
    expect(pool.available).toBe(2);
  });

  test('release returns state to pool and resets fields', () => {
    const pool = CompositorStatePool.make(2);
    const state = pool.acquire();
    expect(pool.available).toBe(1);

    // Write some data
    (state.discrete as Record<string, string>)['test'] = 'value';
    (state.blend as Record<string, Record<string, number>>)['mix'] = { mobile: 0.25, desktop: 0.75 };
    (state.outputs.css as Record<string, string>)['--foo'] = 'bar';
    (state.outputs.glsl as Record<string, number>)['u_mix'] = 1;
    (state.outputs.aria as Record<string, string>)['aria-hidden'] = 'true';

    pool.release(state);
    expect(pool.available).toBe(2);

    // Fields should be reset
    expect(state.discrete).toEqual({});
    expect(state.blend).toEqual({});
    expect(state.outputs.css).toEqual({});
    expect(state.outputs.glsl).toEqual({});
    expect(state.outputs.aria).toEqual({});
  });

  test('released state can be re-acquired', () => {
    const pool = CompositorStatePool.make(1);
    const state1 = pool.acquire();
    expect(pool.available).toBe(0);

    pool.release(state1);
    expect(pool.available).toBe(1);

    const state2 = pool.acquire();
    expect(state2).toBe(state1); // Same object reused
  });

  test('overflow allocation when all slots in use', () => {
    const pool = CompositorStatePool.make(2);
    pool.acquire();
    pool.acquire();
    expect(pool.available).toBe(0);

    // Should not throw — allocates overflow
    const overflow = pool.acquire();
    expect(overflow).toBeDefined();
    expect(pool.size).toBe(3); // Grew by 1
  });

  test('release of unknown state is no-op', () => {
    const pool = CompositorStatePool.make(2);
    const foreign = {
      discrete: {},
      blend: {},
      outputs: { css: {}, glsl: {}, aria: {} },
    };
    // Should not throw
    pool.release(foreign);
    expect(pool.available).toBe(2);
  });

  test('acquire pointer wraps to the first released slot after later slots were allocated', () => {
    const pool = CompositorStatePool.make(3);
    const first = pool.acquire();
    const second = pool.acquire();
    const third = pool.acquire();

    pool.release(second);
    expect(pool.available).toBe(1);

    const reacquired = pool.acquire();
    expect(reacquired).toBe(second);
    expect(reacquired).not.toBe(first);
    expect(reacquired).not.toBe(third);
    expect(pool.available).toBe(0);
  });

  test('overflow state release resets fields even when reacquisition stays on the cold path', () => {
    const pool = CompositorStatePool.make(1);
    const pooled = pool.acquire();
    const overflow = pool.acquire();

    (overflow.discrete as Record<string, string>).mode = 'overflow';
    pool.release(overflow);
    expect(overflow.discrete).toEqual({});

    const reacquiredOverflow = pool.acquire();
    expect(reacquiredOverflow).not.toBe(overflow);
    expect(reacquiredOverflow).not.toBe(pooled);
    expect(pool.size).toBe(3);
  });

  test('double release is benign and does not inflate available capacity', () => {
    const pool = CompositorStatePool.make(2);
    const state = pool.acquire();

    pool.release(state);
    expect(pool.available).toBe(2);

    pool.release(state);
    expect(pool.available).toBe(2);
  });

  test('mixed pooled and overflow reuse reports stable size and available counts', () => {
    const pool = CompositorStatePool.make(2);
    const first = pool.acquire();
    const second = pool.acquire();
    const overflow = pool.acquire();

    expect(pool.size).toBe(3);
    expect(pool.available).toBe(0);

    pool.release(second);
    pool.release(overflow);
    expect(pool.size).toBe(3);
    expect(pool.available).toBe(2);

    const reusedSecond = pool.acquire();
    const reusedOverflow = pool.acquire();
    expect(reusedSecond).toBe(second);
    expect(reusedOverflow).not.toBe(overflow);
    expect(pool.size).toBe(4);
    expect(pool.available).toBe(1);

    pool.release(first);
    pool.release(reusedSecond);
    pool.release(reusedOverflow);
    expect(pool.size).toBe(4);
    expect(pool.available).toBe(4);
  });
});
