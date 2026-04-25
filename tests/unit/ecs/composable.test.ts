/**
 * ECS Composable Infrastructure Tests
 * 
 * Type-driven tests for ECS composition over existing primitives.
 * Tests first, implementation second - red-green methodology.
 */

import { describe, test, expect } from 'vitest';
import { Effect, Schema } from 'effect';
import { Boundary, Composable, ComposableWorld, Part, Style, Token, World } from '@czap/core';

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

type TestSchema = {
  boundary?: typeof boundary;
  token?: typeof token;
  style?: typeof style;
};

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

const scorePart = {
  name: 'score',
  schema: Schema.Number,
};

describe('ECS Composable Infrastructure', () => {
  test('World.make returns a world with the required methods', () => {
    const world = Effect.runSync(Effect.scoped(World.make()));

    expect(world.spawn).toBeTypeOf('function');
    expect(world.despawn).toBeTypeOf('function');
    expect(world.addComponent).toBeTypeOf('function');
    expect(world.removeComponent).toBeTypeOf('function');
    expect(world.query).toBeTypeOf('function');
    expect(world.addSystem).toBeTypeOf('function');
    expect(world.tick).toBeTypeOf('function');
    expect(world.addDenseStore).toBeTypeOf('function');
  });

  test('World.spawn returns unique EntityIds with a content fingerprint suffix', () => {
    const [id1, id2] = Effect.runSync(
      Effect.scoped(
        Effect.gen(function* () {
          const world = yield* World.make();
          const first = yield* world.spawn({ type: 'enemy' });
          const second = yield* world.spawn({ type: 'enemy' });
          return [first, second] as const;
        }),
      ),
    );

    expect(id1).toMatch(/^entity-\d+:fnv1a:[0-9a-f]{8}$/);
    expect(id2).toMatch(/^entity-\d+:fnv1a:[0-9a-f]{8}$/);
    expect(id1).not.toBe(id2);
    // Same components must produce the same content fingerprint (fnv1a:XXXXXXXX)
    expect(id1.substring(id1.indexOf(':') + 1)).toBe(id2.substring(id2.indexOf(':') + 1));
  });

  test('World query, addComponent, removeComponent, and despawn all behave correctly', () => {
    const result = Effect.runSync(
      Effect.scoped(
        Effect.gen(function* () {
          const world = yield* World.make();
          const entityId = yield* world.spawn({ tag: 'player' });
          const missingId = 'entity-999:fnv1a:deadbeef' as never;

          yield* world.addComponent(entityId, scorePart, 42);
          yield* world.addComponent(missingId, scorePart, 1);

          const withScore = yield* world.query('tag', 'score');
          yield* world.removeComponent(entityId, 'score');
          yield* world.removeComponent(missingId, 'score');
          const afterRemoval = yield* world.query('tag', 'score');
          yield* world.despawn(entityId);
          yield* world.despawn(missingId);
          const afterDespawn = yield* world.query('tag');

          return {
            withScore,
            afterRemoval,
            afterDespawn,
          };
        }),
      ),
    );

    expect(result.withScore).toHaveLength(1);
    expect(result.withScore[0]?.components.get('score')).toBe(42);
    expect(result.afterRemoval).toHaveLength(0);
    expect(result.afterDespawn).toHaveLength(0);
  });

  test('regular systems execute during tick with matched query results', () => {
    const executions = Effect.runSync(
      Effect.scoped(
        Effect.gen(function* () {
          const world = yield* World.make();
          yield* world.spawn({ position: { x: 1, y: 2 } });
          yield* world.spawn({ position: { x: 3, y: 4 } });

          let callCount = 0;
          let lastMatched = 0;

          yield* world.addSystem({
            name: 'position-reader',
            query: ['position'],
            execute(entities) {
              callCount++;
              lastMatched = entities.length;
              return Effect.void;
            },
          });

          yield* world.tick();
          return { callCount, lastMatched };
        }),
      ),
    );

    expect(executions.callCount).toBe(1);
    expect(executions.lastMatched).toBe(2);
  });

  test('dense systems execute only when all queried stores are registered', () => {
    const result = Effect.runSync(
      Effect.scoped(
        Effect.gen(function* () {
          const world = yield* World.make();
          const posX = Part.dense('posX', 8);
          const posY = Part.dense('posY', 8);
          const id = yield* world.spawn();
          posX.set(id, 1);
          posY.set(id, 2);

          let executedWithMissingStore = false;
          let executedWithAllStores = false;

          yield* world.addSystem({
            name: 'dense-mover',
            query: ['posX', 'posY'],
            _denseSystem: true,
            execute(stores) {
              executedWithMissingStore = stores.size < 2;
              executedWithAllStores = stores.size === 2;
              const xStore = stores.get('posX');
              const yStore = stores.get('posY');
              if (xStore && yStore) {
                xStore.data[0] = xStore.data[0]! + 1;
                yStore.data[0] = yStore.data[0]! + 1;
              }
              return Effect.void;
            },
          });

          yield* world.addDenseStore(posX);
          yield* world.tick();
          const afterMissingTick = posX.get(id);
          yield* world.addDenseStore(posY);
          yield* world.tick();

          return {
            executedWithMissingStore,
            executedWithAllStores,
            afterMissingTick,
            x: posX.get(id),
            y: posY.get(id),
          };
        }),
      ),
    );

    expect(result.executedWithMissingStore).toBe(false);
    expect(result.executedWithAllStores).toBe(true);
    expect(result.afterMissingTick).toBe(1);
    expect(result.x).toBe(2);
    expect(result.y).toBe(3);
  });

  test('Part.dense supports set/get/overwrite/delete/reset/view/entities and capacity checks', () => {
    const store = Part.dense('hp', 3);
    const idA = 'entity-1:fnv1a:aaaaaaaa' as never;
    const idB = 'entity-2:fnv1a:bbbbbbbb' as never;
    const idC = 'entity-3:fnv1a:cccccccc' as never;
    const idD = 'entity-4:fnv1a:dddddddd' as never;

    expect(store.view()).toHaveLength(0);
    expect(store.entities()).toEqual([]);
    expect(store.has(idA)).toBe(false);
    expect(store.get(idA)).toBeUndefined();

    store.set(idA, 10);
    store.set(idB, 20);
    store.set(idC, 30);
    store.set(idB, 25);

    expect(store.count).toBe(3);
    expect(store.get(idA)).toBe(10);
    expect(store.get(idB)).toBe(25);
    expect(store.get(idC)).toBe(30);
    expect(Array.from(store.view())).toEqual([10, 25, 30]);
    expect(store.entities()).toEqual([idA, idB, idC]);

    expect(() => store.set(idD, 40)).toThrow(RangeError);
    expect(store.delete(idB)).toBe(true);
    expect(store.count).toBe(2);
    expect(store.get(idB)).toBeUndefined();
    expect(store.get(idC)).toBe(30);
    expect(Array.from(store.view())).toEqual([10, 30]);
    expect(store.entities()).toEqual([idA, idC]);
    expect(store.delete(idD)).toBe(false);

    // Single-element deletion (no swap needed when idx === lastIdx)
    store.reset();
    store.set(idA, 77);
    expect(store.count).toBe(1);
    expect(store.delete(idA)).toBe(true);
    expect(store.count).toBe(0);
    expect(store.get(idA)).toBeUndefined();
    expect(store.view()).toHaveLength(0);

    store.reset();

    expect(store.count).toBe(0);
    expect(store.entities()).toEqual([]);
    expect(store.view()).toHaveLength(0);
  });

  test('Composable.make is deterministic and Composable.compose/merge use last-write-wins semantics', () => {
    const entityA = Composable.make<TestSchema>({ boundary, token });
    const entityACopy = Composable.make<TestSchema>({ boundary, token });
    const entityB = Composable.make<TestSchema>({ token, style });
    const composed = Composable.compose(entityA, entityB);
    const merged = Composable.merge(entityA, entityB);

    expect(entityA.id).toBe(entityACopy.id);
    expect(entityA._tag).toBe('ComposableEntity');
    expect(composed.id).toBe(merged.id);
    expect(composed.components.boundary).toBe(boundary);
    expect(composed.components.token).toBe(token);
    expect(composed.components.style).toBe(style);
    expect(() => Composable.merge()).toThrow('Cannot merge zero entities');
  });

  test('ComposableWorld spawn, query, and evaluate integrate Boundary, Token, and Style', () => {
    const result = Effect.runSync(
      Effect.scoped(
        Effect.gen(function* () {
          const world = yield* World.make();
          const composableWorld = ComposableWorld.make(world);
          const entity = yield* composableWorld.spawn({ boundary, token, style });
          const queried = yield* composableWorld.query('boundary', 'token');
          const evaluation = yield* composableWorld.evaluate(entity, {
            'viewport.width': 800,
            themeLevel: 1,
          });
          return { entity, queried, evaluation };
        }),
      ),
    );

    expect(result.entity.id).toMatch(/^fnv1a:[0-9a-f]{8}$/);
    expect(result.queried).toHaveLength(1);
    expect(result.queried[0]?.components.boundary).toEqual(boundary);
    expect(result.evaluation['viewport.width']).toBe('tablet');
    expect(result.evaluation.primary).toBe('#00e5ff');
    expect(result.evaluation.padding).toBe('2rem');
    expect(result.evaluation.display).toBe('grid');
  });

  test('ComposableWorld evaluate handles empty input and entities with no known components', () => {
    const result = Effect.runSync(
      Effect.scoped(
        Effect.gen(function* () {
          const world = yield* World.make();
          const composableWorld = ComposableWorld.make(world);
          const entity = Composable.make({ misc: 'value' });
          yield* composableWorld.spawnWith(entity);
          return yield* composableWorld.evaluate(entity, {});
        }),
      ),
    );

    expect(result).toEqual({});
  });

  test('ComposableWorld.dense create/store/retrieve works and auto-spawns tracked entities', () => {
    const result = Effect.runSync(
      Effect.scoped(
        Effect.gen(function* () {
          const world = yield* World.make();
          const dense = ComposableWorld.dense(world);
          const entity = Composable.make({ boundary });

          const beforeCreate = yield* dense.retrieve(entity);
          const store = yield* dense.create('metrics', 16);
          yield* dense.store(entity, 42);
          const afterStore = yield* dense.retrieve(entity);

          return { beforeCreate, afterStore, store };
        }),
      ),
    );

    expect(result.beforeCreate).toBeUndefined();
    expect(result.afterStore).toBe(42);
    expect(result.store.name).toBe('metrics');
    expect(result.store.count).toBe(1);
  });

  test('ComposableWorld.dense store throws if create was not called first', () => {
    expect(() =>
      Effect.runSync(
        Effect.scoped(
          Effect.gen(function* () {
            const world = yield* World.make();
            const dense = ComposableWorld.dense(world);
            const entity = Composable.make({ boundary });
            yield* dense.store(entity, 1);
          }),
        ),
      ),
    ).toThrow('No dense store created. Call create() first.');
  });
});
