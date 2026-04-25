/**
 * Integration Tests: ECS Composable Composition
 * 
 * End-to-end integration tests for ECS composition over existing primitives.
 * These tests verify the complete composition pipeline works together.
 */

import { describe, test, expect } from 'vitest';
import { Effect } from 'effect';
import { Boundary, Composable, ComposableWorld, Part, RuntimeCoordinator, Style, Token, World } from '@czap/core';

const boundary = Boundary.make({
  input: 'viewport.width',
  at: [[0, 'mobile'], [768, 'tablet'], [1024, 'desktop']],
});

const token = Token.make({
  name: 'primary',
  category: 'color',
  axes: ['themeLevel'] as const,
  values: {
    '1': '#00e5ff',
    '2': '#ff6b6b',
  },
  fallback: '#00e5ff',
});

const style = Style.make({
  boundary,
  base: {
    properties: {
      display: 'grid',
      padding: '1rem',
    },
  },
  states: {
    tablet: {
      properties: {
        padding: '2rem',
      },
    },
    desktop: {
      properties: {
        padding: '3rem',
      },
    },
  },
});

type TestSchema = {
  boundary?: typeof boundary;
  token?: typeof token;
  style?: typeof style;
};

describe('ECS Composition Integration', () => {
  test('full lifecycle: spawn, query, evaluate, add system, and tick', () => {
    const result = Effect.runSync(
      Effect.scoped(
        Effect.gen(function* () {
          const world = yield* World.make();
          const composableWorld = ComposableWorld.make<TestSchema>(world);
          const entityA = yield* composableWorld.spawn({ boundary, token, style });
          const entityB = yield* composableWorld.spawn({ boundary });
          yield* composableWorld.spawn({ token });

          const queried = yield* composableWorld.query('boundary');
          const evaluationA = yield* composableWorld.evaluate(entityA, {
            'viewport.width': 900,
            themeLevel: 1,
          });
          const evaluationB = yield* composableWorld.evaluate(entityB, {
            'viewport.width': 1200,
          });

          let executed = 0;
          let matched = 0;
          yield* world.addSystem({
            name: 'boundary-system',
            query: ['boundary'],
            execute(entities) {
              executed++;
              matched = entities.length;
              return Effect.void;
            },
          });

          yield* world.tick();

          return { queried, evaluationA, evaluationB, executed, matched };
        }),
      ),
    );

    expect(result.queried).toHaveLength(2);
    expect(result.evaluationA['viewport.width']).toBe('tablet');
    expect(result.evaluationA.primary).toBe('#00e5ff');
    expect(result.evaluationA.padding).toBe('2rem');
    expect(result.evaluationB['viewport.width']).toBe('desktop');
    expect(result.executed).toBe(1);
    expect(result.matched).toBe(2);
  });

  test('dense store lifecycle integrates with world tick and retrieval', () => {
    const result = Effect.runSync(
      Effect.scoped(
        Effect.gen(function* () {
          const world = yield* World.make();
          const dense = ComposableWorld.dense(world);
          const metrics = yield* dense.create('metrics', 8);
          const entity = Composable.make<TestSchema>({ boundary, token });
          yield* dense.store(entity, 5);

          let seenMetric = 0;
          yield* world.addSystem({
            name: 'metrics-system',
            query: ['metrics'],
            _denseSystem: true,
            execute(stores) {
              const store = stores.get('metrics');
              if (store) {
                seenMetric = store.data[0] ?? 0;
                store.data[0] = seenMetric + 10;
              }
              return Effect.void;
            },
          });

          yield* world.tick();
          const afterTick = yield* dense.retrieve(entity);

          return { metrics, seenMetric, afterTick };
        }),
      ),
    );

    expect(result.metrics.name).toBe('metrics');
    expect(result.seenMetric).toBe(5);
    expect(result.afterTick).toBe(15);
  });

  test('entity despawn removes entities from queries and dense stores', () => {
    const result = Effect.runSync(
      Effect.scoped(
        Effect.gen(function* () {
          const world = yield* World.make();
          const denseStore = Part.dense('hp', 16);
          yield* world.addDenseStore(denseStore);
          const id = yield* world.spawn({ boundary, role: 'hero' });
          denseStore.set(id, 99);

          const before = yield* world.query('boundary');
          yield* world.despawn(id);
          const after = yield* world.query('boundary');

          return {
            before,
            after,
            hp: denseStore.get(id),
            count: denseStore.count,
          };
        }),
      ),
    );

    expect(result.before).toHaveLength(1);
    expect(result.after).toHaveLength(0);
    expect(result.hp).toBeUndefined();
    expect(result.count).toBe(0);
  });

  test('Composable composition pipeline stays content-address stable across creation paths', () => {
    const direct = Composable.make<TestSchema>({ boundary, token, style });
    const composed = Composable.compose(
      Composable.make<TestSchema>({ boundary }),
      Composable.make<TestSchema>({ token, style }),
    );
    const merged = Composable.merge(
      Composable.make<TestSchema>({ boundary }),
      Composable.make<TestSchema>({ token }),
      Composable.make<TestSchema>({ style }),
    );

    expect(direct.id).toBe(composed.id);
    expect(direct.id).toBe(merged.id);
  });

  test('multiple systems execute in registration order', () => {
    const order = Effect.runSync(
      Effect.scoped(
        Effect.gen(function* () {
          const world = yield* World.make();
          yield* world.spawn({ boundary });
          const calls: string[] = [];

          yield* world.addSystem({
            name: 'first',
            query: ['boundary'],
            execute() {
              calls.push('first');
              return Effect.void;
            },
          });

          yield* world.addSystem({
            name: 'second',
            query: ['boundary'],
            execute() {
              calls.push('second');
              return Effect.void;
            },
          });

          yield* world.tick();
          return calls;
        }),
      ),
    );

    expect(order).toEqual(['first', 'second']);
  });

  test('RuntimeCoordinator uses dense stores to manage quantizer state', () => {
    const coordinator = RuntimeCoordinator.create({ capacity: 8, name: 'ecs-runtime' });

    const entityId = coordinator.registerQuantizer('viewport', ['mobile', 'tablet', 'desktop']);
    coordinator.setState('viewport', 'tablet');
    coordinator.markDirty('viewport');

    expect(entityId).toMatch(/^runtime-\d+$/);
    expect(coordinator.hasQuantizer('viewport')).toBe(true);
    expect(coordinator.getStateIndex('viewport')).toBe(1);
    expect(coordinator.getDirtyEpoch('viewport')).toBe(2);
    expect(coordinator.registeredNames()).toEqual(['viewport']);

    coordinator.removeQuantizer('viewport');
    expect(coordinator.hasQuantizer('viewport')).toBe(false);
    expect(coordinator.getStateIndex('viewport')).toBe(0);
  });

  test('existing primitive validation still governs ECS composition inputs', () => {
    expect(() =>
      Boundary.make({
        input: 'viewport.width',
        at: [[768, 'tablet'], [0, 'mobile']],
      }),
    ).toThrow();

    expect(() =>
      Token.make({
        name: '',
        category: 'color',
        axes: ['theme'] as const,
        values: { dark: '#00e5ff' },
        fallback: '#00e5ff',
      }),
    ).toThrow();
  });
});
