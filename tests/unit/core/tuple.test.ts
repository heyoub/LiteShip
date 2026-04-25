import { describe, it, expect } from 'vitest';
import { tupleMap } from '@czap/core';

describe('tupleMap', () => {
  it('preserves tuple arity and element ordering', () => {
    const input = [1, 'two', true] as const;
    const result = tupleMap(input, (el) => typeof el);
    expect(result).toEqual(['number', 'string', 'boolean']);
    expect(result.length).toBe(3);
  });

  it('passes index as second argument', () => {
    const input = ['a', 'b', 'c'] as const;
    const result = tupleMap(input, (_el, i) => i);
    expect(result).toEqual([0, 1, 2]);
  });

  it('handles empty tuple', () => {
    const result = tupleMap([] as const, (el) => el);
    expect(result).toEqual([]);
  });

  it('preserves readonly tuple type at compile time', () => {
    const input = [1, 2, 3] as const;
    const result: readonly [number, number, number] = tupleMap(input, (n) => n * 2);
    expect(result).toEqual([2, 4, 6]);
  });
});
