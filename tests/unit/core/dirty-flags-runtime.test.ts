import { describe, expect, test } from 'vitest';
import { DirtyFlags } from '@czap/core';

describe('DirtyFlags runtime edge cases', () => {
  test('ignores unknown keys when marking, clearing, and checking dirtiness', () => {
    const flags = DirtyFlags.make(['position', 'opacity'] as const);

    flags.mark('position');
    flags.mark('missing' as never);
    flags.clear('missing' as never);

    expect(flags.isDirty('position')).toBe(true);
    expect(flags.isDirty('missing' as never)).toBe(false);
    expect(flags.getDirty()).toEqual(['position']);
  });

  test('clearAll resets the mask and dirty key list', () => {
    const flags = DirtyFlags.make(['position', 'opacity'] as const);

    flags.mark('position');
    flags.mark('opacity');
    expect(flags.mask).toBeGreaterThan(0);

    flags.clearAll();

    expect(flags.mask).toBe(0);
    expect(flags.getDirty()).toEqual([]);
  });

  test('throws when more than the supported number of keys is provided', () => {
    const keys = Array.from({ length: 32 }, (_, index) => `k${index}` as const);
    expect(() => DirtyFlags.make(keys)).toThrow(/supports at most/);
  });
});
