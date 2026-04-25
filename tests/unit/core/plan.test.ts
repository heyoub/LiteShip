/**
 * Plan -- plan IR builder, validation, topoSort, and cycle detection.
 */

import { describe, test, expect } from 'vitest';
import { Plan } from '@czap/core';
import type { OpType } from '@czap/core';

const noop: OpType = { type: 'noop' };
const pure: OpType = { type: 'pure', fn: 'identity' };
const effectOp: OpType = { type: 'effect', fn: 'fetch' };

describe('Plan', () => {
  describe('builder', () => {
    test('make creates builder that produces plan IR', () => {
      const plan = Plan.make('test-plan').step('Step A', noop).step('Step B', pure).build();

      expect(plan.name).toBe('test-plan');
      expect(plan.steps).toHaveLength(2);
      expect(plan.steps[0]!.id).toBe('step-1');
      expect(plan.steps[0]!.name).toBe('Step A');
      expect(plan.steps[1]!.id).toBe('step-2');
    });

    test('seq creates sequential edge', () => {
      const plan = Plan.make('seq-plan').step('A', noop).step('B', noop).seq('step-1', 'step-2').build();

      expect(plan.edges).toHaveLength(1);
      expect(plan.edges[0]).toEqual({ from: 'step-1', to: 'step-2', type: 'seq' });
    });

    test('par creates parallel edge', () => {
      const plan = Plan.make('par-plan').step('A', noop).step('B', noop).par('step-1', 'step-2').build();

      expect(plan.edges[0]!.type).toBe('par');
    });

    test('choice creates then/else edges', () => {
      const plan = Plan.make('choice-plan')
        .step('Check', { type: 'choice', condition: true })
        .step('Then', noop)
        .step('Else', noop)
        .choice('step-1', 'step-2', 'step-3')
        .build();

      expect(plan.edges).toHaveLength(2);
      expect(plan.edges[0]).toEqual({ from: 'step-1', to: 'step-2', type: 'choice_then' });
      expect(plan.edges[1]).toEqual({ from: 'step-1', to: 'step-3', type: 'choice_else' });
    });

    test('step with metadata preserves metadata', () => {
      const plan = Plan.make('meta-plan').step('Annotated', noop, { priority: 'high', retries: 3 }).build();

      expect(plan.steps[0]!.metadata).toEqual({ priority: 'high', retries: 3 });
    });
  });

  describe('topoSort with valid DAG', () => {
    test('linear chain sorts in order', () => {
      const plan = Plan.make('linear')
        .step('A', noop)
        .step('B', noop)
        .step('C', noop)
        .seq('step-1', 'step-2')
        .seq('step-2', 'step-3')
        .build();

      const result = Plan.topoSort(plan);
      expect(result.cycle).toBeUndefined();
      expect(result.sorted).toEqual(['step-1', 'step-2', 'step-3']);
    });

    test('diamond DAG respects dependencies', () => {
      const plan = Plan.make('diamond')
        .step('Root', noop)
        .step('Left', noop)
        .step('Right', noop)
        .step('Join', noop)
        .seq('step-1', 'step-2')
        .seq('step-1', 'step-3')
        .seq('step-2', 'step-4')
        .seq('step-3', 'step-4')
        .build();

      const result = Plan.topoSort(plan);
      expect(result.cycle).toBeUndefined();
      expect(result.sorted).toHaveLength(4);

      const order = new Map(result.sorted.map((id, i) => [id, i]));
      expect(order.get('step-1')!).toBeLessThan(order.get('step-2')!);
      expect(order.get('step-1')!).toBeLessThan(order.get('step-3')!);
      expect(order.get('step-2')!).toBeLessThan(order.get('step-4')!);
      expect(order.get('step-3')!).toBeLessThan(order.get('step-4')!);
    });

    test('disconnected steps are all included', () => {
      const plan = Plan.make('disconnected').step('A', noop).step('B', noop).step('C', noop).build();

      const result = Plan.topoSort(plan);
      expect(result.cycle).toBeUndefined();
      expect(result.sorted).toHaveLength(3);
    });

    test('cross edges to already-completed nodes do not report a cycle', () => {
      const plan = Plan.make('cross-edge')
        .step('A', noop)
        .step('B', noop)
        .step('C', noop)
        .seq('step-1', 'step-2')
        .seq('step-1', 'step-3')
        .seq('step-3', 'step-2')
        .build();

      const result = Plan.topoSort(plan);
      expect(result.cycle).toBeUndefined();
      expect(result.sorted).toEqual(['step-1', 'step-3', 'step-2']);
    });
  });

  describe('topoSort with cycle', () => {
    test('direct cycle returns cycle nodes', () => {
      const plan = Plan.make('cycle')
        .step('A', noop)
        .step('B', noop)
        .seq('step-1', 'step-2')
        .seq('step-2', 'step-1')
        .build();

      const result = Plan.topoSort(plan);
      expect(result.cycle).toBeDefined();
      expect(result.cycle!.length).toBeGreaterThan(0);
    });

    test('indirect cycle returns cycle nodes', () => {
      const plan = Plan.make('indirect-cycle')
        .step('A', noop)
        .step('B', noop)
        .step('C', noop)
        .seq('step-1', 'step-2')
        .seq('step-2', 'step-3')
        .seq('step-3', 'step-1')
        .build();

      const result = Plan.topoSort(plan);
      expect(result.cycle).toBeDefined();
      expect(result.cycle!).toContain('step-1');
      expect(result.cycle!).toContain('step-2');
      expect(result.cycle!).toContain('step-3');
    });

    test('partial cycle only reports cycle nodes, sorted part contains non-cycle', () => {
      const plan = Plan.make('partial-cycle')
        .step('Free', noop)
        .step('A', noop)
        .step('B', noop)
        .seq('step-1', 'step-2')
        .seq('step-2', 'step-3')
        .seq('step-3', 'step-2')
        .build();

      const result = Plan.topoSort(plan);
      expect(result.cycle).toBeDefined();
      expect(result.sorted).toContain('step-1');
      expect(result.cycle!).toContain('step-2');
      expect(result.cycle!).toContain('step-3');
    });
  });

  describe('validate', () => {
    test('valid plan returns ok: true', () => {
      const plan = Plan.make('valid').step('A', noop).step('B', noop).seq('step-1', 'step-2').build();

      const result = Plan.validate(plan);
      expect(result.ok).toBe(true);
    });

    test('plan with cycle returns ok: false with cycle error', () => {
      const plan = Plan.make('cyclic')
        .step('A', noop)
        .step('B', noop)
        .seq('step-1', 'step-2')
        .seq('step-2', 'step-1')
        .build();

      const result = Plan.validate(plan);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e) => e.type === 'cycle')).toBe(true);
      }
    });

    test('plan with missing step reference returns missing_step error', () => {
      const plan = Plan.make('missing-ref').step('A', noop).seq('step-1', 'step-999').build();

      const result = Plan.validate(plan);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e) => e.type === 'missing_step')).toBe(true);
      }
    });

    test('plan with missing source step reference returns missing_step error for from ids too', () => {
      const plan = Plan.make('missing-from').step('A', noop).seq('step-999', 'step-1').build();

      const result = Plan.validate(plan);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            type: 'missing_step',
            stepIds: ['step-999'],
          }),
        );
      }
    });

    test('valid plan returns plan in result', () => {
      const plan = Plan.make('valid').step('A', pure).step('B', effectOp).seq('step-1', 'step-2').build();

      const result = Plan.validate(plan);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.plan.name).toBe('valid');
        expect(result.plan.steps).toHaveLength(2);
      }
    });

    test('validate does not treat already-completed cross edges as cycles', () => {
      const plan = Plan.make('diamond')
        .step('Root', noop)
        .step('Left', noop)
        .step('Right', noop)
        .step('Join', noop)
        .seq('step-1', 'step-2')
        .seq('step-1', 'step-3')
        .seq('step-2', 'step-4')
        .seq('step-3', 'step-4')
        .build();

      const result = Plan.validate(plan);
      expect(result.ok).toBe(true);
    });
  });

  describe('invalid topology handling', () => {
    test('topoSort tolerates edges that point to non-step neighbors', () => {
      const result = Plan.topoSort({
        name: 'dangling-edge',
        steps: [{ id: 'step-1', name: 'Only', opType: noop }],
        edges: [{ from: 'step-1', to: 'step-999', type: 'seq' }],
      });

      expect(result.sorted).toEqual(['step-1', 'step-999']);
      expect(result.cycle).toEqual([]);
    });
  });
});
