/**
 * BlendTree -- weighted multi-state blending.
 *
 * Property: compute() with all equal weights = arithmetic mean.
 * Property: compute() with single node = exact values.
 * Property: compute() with zero/negative weights excluded from blend.
 */

import { describe, test, expect } from 'vitest';
import fc from 'fast-check';
import { Effect, Stream } from 'effect';
import { BlendTree } from '@czap/core';
import { runScopedAsync as runScoped } from '../../helpers/effect-test.js';

// ---------------------------------------------------------------------------
// Basic operations
// ---------------------------------------------------------------------------

describe('BlendTree', () => {
  test('make creates a blend tree', async () => {
    const tree = await runScoped(BlendTree.make<{ x: number }>());
    expect(tree).toBeDefined();
    expect(tree.compute).toBeDefined();
    expect(tree.add).toBeDefined();
    expect(tree.remove).toBeDefined();
    expect(tree.setWeight).toBeDefined();
  });

  test('compute on empty tree returns empty object', async () => {
    const tree = await runScoped(BlendTree.make<{ x: number }>());
    expect(tree.compute()).toEqual({});
  });

  test('single node returns exact values', async () => {
    const tree = await runScoped(BlendTree.make<{ x: number; y: number }>());
    tree.add('a', { x: 10, y: 20 }, 1);
    expect(tree.compute()).toEqual({ x: 10, y: 20 });
  });

  test('two equal-weight nodes return averages', async () => {
    const tree = await runScoped(BlendTree.make<{ x: number }>());
    tree.add('a', { x: 0 }, 1);
    tree.add('b', { x: 100 }, 1);
    expect(tree.compute().x).toBeCloseTo(50, 5);
  });

  test('weighted blend respects weights', async () => {
    const tree = await runScoped(BlendTree.make<{ x: number }>());
    tree.add('a', { x: 0 }, 1);
    tree.add('b', { x: 100 }, 3);
    // Expected: (0*0.25 + 100*0.75) = 75
    expect(tree.compute().x).toBeCloseTo(75, 5);
  });

  test('remove eliminates node from blend', async () => {
    const tree = await runScoped(BlendTree.make<{ x: number }>());
    tree.add('a', { x: 10 }, 1);
    tree.add('b', { x: 90 }, 1);
    tree.remove('a');
    expect(tree.compute()).toEqual({ x: 90 });
  });

  test('setWeight updates node weight', async () => {
    const tree = await runScoped(BlendTree.make<{ x: number }>());
    tree.add('a', { x: 0 }, 1);
    tree.add('b', { x: 100 }, 1);
    tree.setWeight('a', 0);
    // Only b contributes (weight 1), a has weight 0
    expect(tree.compute().x).toBeCloseTo(100, 5);
  });

  test('setWeight on non-existent node is no-op', async () => {
    const tree = await runScoped(BlendTree.make<{ x: number }>());
    tree.add('a', { x: 10 }, 1);
    tree.setWeight('nonexistent', 5);
    expect(tree.compute()).toEqual({ x: 10 });
  });

  test('all zero-weight nodes return empty object', async () => {
    const tree = await runScoped(BlendTree.make<{ x: number }>());
    tree.add('a', { x: 10 }, 0);
    tree.add('b', { x: 20 }, 0);
    expect(tree.compute()).toEqual({});
  });

  test('add overwrites existing node', async () => {
    const tree = await runScoped(BlendTree.make<{ x: number }>());
    tree.add('a', { x: 10 }, 1);
    tree.add('a', { x: 99 }, 1);
    expect(tree.compute()).toEqual({ x: 99 });
  });

  test('multi-key blending', async () => {
    const tree = await runScoped(BlendTree.make<{ x: number; y: number; z: number }>());
    tree.add('a', { x: 0, y: 0, z: 0 }, 1);
    tree.add('b', { x: 100, y: 200, z: 300 }, 1);
    const result = tree.compute();
    expect(result.x).toBeCloseTo(50, 5);
    expect(result.y).toBeCloseTo(100, 5);
    expect(result.z).toBeCloseTo(150, 5);
  });

  test('ignores inherited numeric properties when computing blends', async () => {
    const tree = await runScoped(BlendTree.make<{ own: number }>());
    const proto = { inherited: 999 };
    const value = Object.assign(Object.create(proto), { own: 12 }) as { own: number };

    tree.add('proto-backed', value, 1);

    expect(tree.compute()).toEqual({ own: 12 });
  });
});

// ---------------------------------------------------------------------------
// Property-based
// ---------------------------------------------------------------------------

describe('BlendTree properties', () => {
  test('single node always returns exact values', () => {
    fc.assert(
      fc.asyncProperty(
        fc.record({
          x: fc.double({ noNaN: true, min: -1000, max: 1000 }),
          y: fc.double({ noNaN: true, min: -1000, max: 1000 }),
        }),
        fc.double({ min: 0.001, max: 100, noNaN: true }),
        async (value, weight) => {
          const tree = await runScoped(BlendTree.make<{ x: number; y: number }>());
          tree.add('only', value, weight);
          const result = tree.compute();
          expect(result.x).toBeCloseTo(value.x, 5);
          expect(result.y).toBeCloseTo(value.y, 5);
        },
      ),
    );
  });

  test('equal weights produce arithmetic mean', () => {
    fc.assert(
      fc.asyncProperty(
        fc.double({ noNaN: true, min: -1000, max: 1000 }),
        fc.double({ noNaN: true, min: -1000, max: 1000 }),
        async (a, b) => {
          const tree = await runScoped(BlendTree.make<{ v: number }>());
          tree.add('a', { v: a }, 1);
          tree.add('b', { v: b }, 1);
          expect(tree.compute().v).toBeCloseTo((a + b) / 2, 5);
        },
      ),
    );
  });
});
