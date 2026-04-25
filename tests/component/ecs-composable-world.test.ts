/**
 * Component test: ComposableWorld end-to-end behavior.
 */

import { describe, test, expect } from 'vitest';
import { Effect } from 'effect';
import { Boundary, Composable, ComposableWorld, Style, Token, World } from '@czap/core';

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

describe('ComposableWorld component behavior', () => {
  test('spawn and query round-trip through a real scoped world', () => {
    const result = Effect.runSync(
      Effect.scoped(
        Effect.gen(function* () {
          const world = yield* World.make();
          const composableWorld = ComposableWorld.make<TestSchema>(world);
          yield* composableWorld.spawn({ boundary });
          yield* composableWorld.spawn({ boundary, token });
          yield* composableWorld.spawn({ token });
          return yield* composableWorld.query('boundary');
        }),
      ),
    );

    expect(result).toHaveLength(2);
    expect(result.every((entity) => entity.components.boundary !== undefined)).toBe(true);
  });

  test('evaluate integrates Boundary and Style for the same entity', () => {
    const result = Effect.runSync(
      Effect.scoped(
        Effect.gen(function* () {
          const world = yield* World.make();
          const composableWorld = ComposableWorld.make<TestSchema>(world);
          const entity = yield* composableWorld.spawn({ boundary, style });
          return yield* composableWorld.evaluate(entity, { 'viewport.width': 800 });
        }),
      ),
    );

    expect(result['viewport.width']).toBe('tablet');
    expect(result.padding).toBe('2rem');
    expect(result.display).toBe('grid');
  });

  test('evaluate falls back to 0 when boundary input key is missing from input record', () => {
    const result = Effect.runSync(
      Effect.scoped(
        Effect.gen(function* () {
          const world = yield* World.make();
          const composableWorld = ComposableWorld.make<TestSchema>(world);
          const entity = yield* composableWorld.spawn({ boundary, style });
          // Omit 'viewport.width' from input — triggers ?? 0 fallback at composable.ts:181
          return yield* composableWorld.evaluate(entity, {});
        }),
      ),
    );

    // With input 0, boundary should evaluate to the first state ('mobile')
    expect(result['viewport.width']).toBe('mobile');
    // Style should resolve base properties (no boundary state match or mobile fallback)
    expect(result.display).toBe('grid');
    expect(result.padding).toBe('1rem');
  });

  test('evaluate integrates Token resolution with numeric axis inputs', () => {
    const result = Effect.runSync(
      Effect.scoped(
        Effect.gen(function* () {
          const world = yield* World.make();
          const composableWorld = ComposableWorld.make<TestSchema>(world);
          const entity = yield* composableWorld.spawn({ token });
          return {
            themed: yield* composableWorld.evaluate(entity, { themeLevel: 2 }),
            fallback: yield* composableWorld.evaluate(entity, {}),
          };
        }),
      ),
    );

    expect(result.themed.primary).toBe('#ff6b6b');
    expect(result.fallback.primary).toBe('#00e5ff');
  });

  test('dense store lifecycle works for composable entities', () => {
    const result = Effect.runSync(
      Effect.scoped(
        Effect.gen(function* () {
          const world = yield* World.make();
          const dense = ComposableWorld.dense(world);
          yield* dense.create('metrics', 32);
          const entity = Composable.make<TestSchema>({ boundary, token });
          yield* dense.store(entity, 123);
          return yield* dense.retrieve(entity);
        }),
      ),
    );

    expect(result).toBe(123);
  });

  test('multiple composable worlds are isolated', () => {
    const result = Effect.runSync(
      Effect.scoped(
        Effect.gen(function* () {
          const worldA = yield* World.make();
          const worldB = yield* World.make();
          const composableWorldA = ComposableWorld.make<TestSchema>(worldA);
          const composableWorldB = ComposableWorld.make<TestSchema>(worldB);

          yield* composableWorldA.spawn({ boundary });
          yield* composableWorldB.spawn({ token });

          return {
            boundariesA: yield* composableWorldA.query('boundary'),
            boundariesB: yield* composableWorldB.query('boundary'),
            tokensA: yield* composableWorldA.query('token'),
            tokensB: yield* composableWorldB.query('token'),
          };
        }),
      ),
    );

    expect(result.boundariesA).toHaveLength(1);
    expect(result.boundariesB).toHaveLength(0);
    expect(result.tokensA).toHaveLength(0);
    expect(result.tokensB).toHaveLength(1);
  });
});
