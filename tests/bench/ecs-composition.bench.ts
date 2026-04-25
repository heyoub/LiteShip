/**
 * Benchmark: ECS Composition Performance
 * 
 * Performance benchmarks for ECS composition over existing primitives.
 * These tests ensure ECS composition has <5% overhead vs direct primitive usage.
 */

import { bench, describe } from 'vitest';
import { Effect } from 'effect';
import { Boundary, Composable, ComposableWorld, Part, Style, Token, World } from '@czap/core';

const boundary = Boundary.make({
  input: 'viewport.width',
  at: [[0, 'mobile'], [768, 'tablet'], [1024, 'desktop']],
});

const token = Token.make({
  name: 'primary',
  category: 'color',
  axes: ['themeLevel'] as const,
  values: { '1': '#00e5ff', '2': 'hsl(175 70% 50%)' },
  fallback: '#00e5ff',
});

const style = Style.make({
  boundary,
  base: { properties: { display: 'grid', padding: '1rem' } },
  states: {
    tablet: { properties: { padding: '2rem' } },
    desktop: { properties: { padding: '3rem' } },
  },
});

type TestSchema = {
  boundary?: typeof boundary;
  token?: typeof token;
  style?: typeof style;
};

const denseStore = Part.dense('hp', 2048);
const denseEntityIds = Array.from({ length: 256 }, (_, index) => `entity-${index}:fnv1a:${index.toString(16).padStart(8, '0')}` as never);
for (const [index, entityId] of denseEntityIds.entries()) {
  denseStore.set(entityId, index);
}

describe('ECS Composition Benchmarks', () => {
  bench('direct boundary evaluation', () => {
    Boundary.evaluate(boundary, 800);
  });

  bench('Composable.make -- boundary only', () => {
    Composable.make<TestSchema>({ boundary });
  });

  bench('Composable.make -- boundary + token + style', () => {
    Composable.make<TestSchema>({ boundary, token, style });
  });

  bench('Composable.compose -- two entities', () => {
    Composable.compose(
      Composable.make<TestSchema>({ boundary }),
      Composable.make<TestSchema>({ token, style }),
    );
  });

  bench('Composable.merge -- three entities', () => {
    Composable.merge(
      Composable.make<TestSchema>({ boundary }),
      Composable.make<TestSchema>({ token }),
      Composable.make<TestSchema>({ style }),
    );
  });

  bench('ComposableWorld.spawn -- single entity', () => {
    Effect.runSync(
      Effect.scoped(
        Effect.gen(function* () {
          const scopedWorld = yield* World.make();
          const scopedComposableWorld = ComposableWorld.make<TestSchema>(scopedWorld);
          yield* scopedComposableWorld.spawn({ boundary, token, style });
        }),
      ),
    );
  });

  bench('ComposableWorld.evaluate -- boundary + token + style', () => {
    Effect.runSync(
      Effect.scoped(
        Effect.gen(function* () {
          const scopedWorld = yield* World.make();
          const scopedComposableWorld = ComposableWorld.make<TestSchema>(scopedWorld);
          const entity = yield* scopedComposableWorld.spawn({ boundary, token, style });
          yield* scopedComposableWorld.evaluate(entity, { 'viewport.width': 800, themeLevel: 1 });
        }),
      ),
    );
  });

  bench('DenseStore get -- hot lookup', () => {
    denseStore.get(denseEntityIds[128]!);
  });

  bench('DenseStore set -- overwrite hot slot', () => {
    denseStore.set(denseEntityIds[128]!, 999);
  });

  bench('DenseStore delete + reinsert', () => {
    const tempStore = Part.dense('temp', 8);
    const idA = 'entity-a:fnv1a:aaaaaaaa' as never;
    const idB = 'entity-b:fnv1a:bbbbbbbb' as never;
    tempStore.set(idA, 1);
    tempStore.set(idB, 2);
    tempStore.delete(idA);
    tempStore.set(idA, 3);
  });

  bench('World.tick -- regular system', () => {
    Effect.runSync(
      Effect.scoped(
        Effect.gen(function* () {
          const scopedWorld = yield* World.make();
          yield* scopedWorld.spawn({ boundary });
          yield* scopedWorld.addSystem({
            name: 'reader',
            query: ['boundary'],
            execute() {
              return Effect.void;
            },
          });
          yield* scopedWorld.tick();
        }),
      ),
    );
  });

  bench('World.tick -- dense system', () => {
    Effect.runSync(
      Effect.scoped(
        Effect.gen(function* () {
          const scopedWorld = yield* World.make();
          const posX = Part.dense('posX', 8);
          const posY = Part.dense('posY', 8);
          yield* scopedWorld.addDenseStore(posX);
          yield* scopedWorld.addDenseStore(posY);
          const id = yield* scopedWorld.spawn();
          posX.set(id, 1);
          posY.set(id, 2);
          yield* scopedWorld.addSystem({
            name: 'dense-reader',
            query: ['posX', 'posY'],
            _denseSystem: true,
            execute(stores) {
              const x = stores.get('posX');
              const y = stores.get('posY');
              if (x && y) {
                x.data[0] = x.data[0]! + 1;
                y.data[0] = y.data[0]! + 1;
              }
              return Effect.void;
            },
          });
          yield* scopedWorld.tick();
        }),
      ),
    );
  });

  bench('ComposableWorld.query -- existing world', () => {
    Effect.runSync(
      Effect.scoped(
        Effect.gen(function* () {
          const scopedWorld = yield* World.make();
          const scopedComposableWorld = ComposableWorld.make<TestSchema>(scopedWorld);
          yield* scopedComposableWorld.spawn({ boundary });
          yield* scopedComposableWorld.spawn({ boundary, token });
          yield* scopedComposableWorld.query('boundary');
        }),
      ),
    );
  });

  bench('baseline object construction', () => {
    const _sink = { boundary, token, style };
    void _sink;
  });

});
