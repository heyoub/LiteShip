/**
 * Property Tests: ECS Composable Composition
 * 
 * Mathematical property verification for ECS composition over existing primitives.
 * Following the same pattern as boundary.prop.test.ts for consistency.
 */

import { describe, test } from 'vitest';
import fc from 'fast-check';
import { Effect } from 'effect';
import { Boundary, Composable, ComposableWorld, Part, Style, Token, World } from '@czap/core';

const arbThresholdPairs = fc
  .uniqueArray(fc.integer({ min: 0, max: 10000 }), { minLength: 2, maxLength: 5 })
  .map((vals) => vals.sort((a, b) => a - b).map((t, i) => [t, `s${i}`] as const));

const arbBoundary = arbThresholdPairs.map((pairs) =>
  Boundary.make({
    input: 'viewport.width',
    at: pairs as unknown as readonly [readonly [number, string], ...readonly [number, string][]],
  }),
);

const arbEntityRecord = fc.dictionary(
  fc.string({ minLength: 1, maxLength: 8 }),
  fc.oneof(fc.string({ maxLength: 12 }), fc.integer({ min: -100, max: 100 }), fc.boolean()),
);

type NumericThemeSchema = {
  boundary?: Boundary.Shape;
  token?: Token.Shape;
  style?: Style.Shape;
};

describe('ECS Composable Properties', () => {
  test('Composable.make is deterministic for the same input', () => {
    fc.assert(
      fc.property(arbEntityRecord, (record) => {
        const left = Composable.make(record);
        const right = Composable.make(record);
        return left.id === right.id;
      }),
    );
  });

  test('Composable.merge is associative for disjoint entities', () => {
    type Bag = Record<string, unknown>;
    fc.assert(
      fc.property(arbEntityRecord, arbEntityRecord, arbEntityRecord, (a, b, c) => {
        const eA = Composable.make<Bag>({ a });
        const eB = Composable.make<Bag>({ b });
        const eC = Composable.make<Bag>({ c });
        const left = Composable.merge(Composable.merge(eA, eB), eC);
        const right = Composable.merge(eA, eB, eC);
        return left.id === right.id;
      }),
    );
  });

  test('World.spawn always produces unique ids', () => {
    fc.assert(
      fc.property(fc.array(fc.option(arbEntityRecord, { nil: undefined }), { minLength: 2, maxLength: 15 }), (componentsList) => {
        const ids = Effect.runSync(
          Effect.scoped(
            Effect.gen(function* () {
              const world = yield* World.make();
              const result: string[] = [];
              for (const components of componentsList) {
                result.push(yield* world.spawn(components ?? undefined));
              }
              return result;
            }),
          ),
        );
        return new Set(ids).size === ids.length;
      }),
    );
  });

  test('World.spawn sequence is strictly increasing', () => {
    fc.assert(
      fc.property(fc.array(arbEntityRecord, { minLength: 2, maxLength: 8 }), (componentsList) => {
        const ids = Effect.runSync(
          Effect.scoped(
            Effect.gen(function* () {
              const world = yield* World.make();
              const result: string[] = [];
              for (const components of componentsList) {
                result.push(yield* world.spawn(components));
              }
              return result;
            }),
          ),
        );
        const sequences = ids.map((id) => Number(id.split(':')[0]?.split('-')[1]));
        return sequences.every((seq, index) => index === 0 || seq > sequences[index - 1]!);
      }),
    );
  });

  test('DenseStore set/get round-trips numeric values', () => {
    fc.assert(
      fc.property(fc.float({ min: -1000, max: 1000, noNaN: true }), (value) => {
        const store = Part.dense('dense', 4);
        const entityId = 'entity-1:fnv1a:aaaaaaaa' as never;
        store.set(entityId, value);
        return store.get(entityId) === value;
      }),
    );
  });

  test('DenseStore swap-remove preserves remaining values', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.float({ min: -1000, max: 1000, noNaN: true }),
          fc.float({ min: -1000, max: 1000, noNaN: true }),
          fc.float({ min: -1000, max: 1000, noNaN: true }),
        ),
        ([a, b, c]) => {
          const store = Part.dense('dense', 4);
          const idA = 'entity-1:fnv1a:aaaaaaaa' as never;
          const idB = 'entity-2:fnv1a:bbbbbbbb' as never;
          const idC = 'entity-3:fnv1a:cccccccc' as never;
          store.set(idA, a);
          store.set(idB, b);
          store.set(idC, c);
          store.delete(idB);
          return store.get(idA) === a && store.get(idC) === c && store.count === 2;
        },
      ),
    );
  });

  test('Boundary evaluation remains monotonic through ComposableWorld.evaluate', () => {
    fc.assert(
      fc.property(arbBoundary, fc.integer({ min: 0, max: 9999 }), (boundary, value) => {
        const states = boundary.states as readonly string[];
        const [evaluationA, evaluationB] = Effect.runSync(
          Effect.scoped(
            Effect.gen(function* () {
              const world = yield* World.make();
              const composableWorld = ComposableWorld.make<NumericThemeSchema>(world);
              const entity = yield* composableWorld.spawn({ boundary });
              const a = yield* composableWorld.evaluate(entity, { 'viewport.width': value });
              const b = yield* composableWorld.evaluate(entity, { 'viewport.width': value + 1 });
              return [a['viewport.width'], b['viewport.width']] as const;
            }),
          ),
        );
        return states.indexOf(evaluationB!) >= states.indexOf(evaluationA!);
      }),
    );
  });

  test('ComposableWorld query is sound and complete for a required component', () => {
    fc.assert(
      fc.property(fc.array(fc.boolean(), { minLength: 1, maxLength: 10 }), (flags) => {
        const matched = Effect.runSync(
          Effect.scoped(
            Effect.gen(function* () {
              const world = yield* World.make();
              const composableWorld = ComposableWorld.make<NumericThemeSchema>(world);
              for (const hasBoundary of flags) {
                if (hasBoundary) {
                  yield* composableWorld.spawn({ boundary: Boundary.make({ input: 'viewport.width', at: [[0, 'a'], [10, 'b']] }) });
                } else {
                  yield* composableWorld.spawn({ token: Token.make({ name: 'x', category: 'color', axes: ['themeLevel'] as const, values: { '1': '#0', '2': '#1' }, fallback: '#0' }) });
                }
              }
              return yield* composableWorld.query('boundary');
            }),
          ),
        );
        return matched.length === flags.filter(Boolean).length && matched.every((entity) => 'boundary' in entity.components);
      }),
    );
  });

  test('Style state selected by ComposableWorld.evaluate matches Boundary-selected state', () => {
    fc.assert(
      fc.property(arbThresholdPairs, fc.integer({ min: 0, max: 10000 }), (pairs, value) => {
        const boundary = Boundary.make({ input: 'viewport.width', at: pairs as any });
        const chosen = Boundary.evaluate(boundary, value);
        const style = Style.make({
          boundary,
          base: { properties: { padding: '0px' } },
          states: Object.fromEntries(boundary.states.map((state, index) => [state, { properties: { padding: `${index}px` } }])) as never,
        });

        const resolved = Effect.runSync(
          Effect.scoped(
            Effect.gen(function* () {
              const world = yield* World.make();
              const composableWorld = ComposableWorld.make<NumericThemeSchema>(world);
              const entity = yield* composableWorld.spawn({ boundary, style });
              return yield* composableWorld.evaluate(entity, { 'viewport.width': value });
            }),
          ),
        );

        const expectedIndex = boundary.states.indexOf(chosen);
        return resolved.padding === `${expectedIndex}px`;
      }),
    );
  });

  test('Token resolution through ComposableWorld.evaluate respects fallback and axes', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 8 }), fc.string({ minLength: 1, maxLength: 8 }), (dark, light) => {
        const token = Token.make({
          name: 'primary',
          category: 'color',
          axes: ['themeLevel'] as const,
          values: { '1': dark, '2': light },
          fallback: dark,
        });

        const [resolvedDark, resolvedFallback] = Effect.runSync(
          Effect.scoped(
            Effect.gen(function* () {
              const world = yield* World.make();
              const composableWorld = ComposableWorld.make<NumericThemeSchema>(world);
              const entity = yield* composableWorld.spawn({ token });
              const a = yield* composableWorld.evaluate(entity, { themeLevel: 1 });
              const b = yield* composableWorld.evaluate(entity, {});
              return [a.primary, b.primary] as const;
            }),
          ),
        );

        return resolvedDark === dark && resolvedFallback === dark;
      }),
    );
  });

  test('EntityId format invariant remains entity-seq:fnv1a:hash', () => {
    fc.assert(
      fc.property(arbEntityRecord, (components) => {
        const id = Effect.runSync(
          Effect.scoped(
            Effect.gen(function* () {
              const world = yield* World.make();
              return yield* world.spawn(components);
            }),
          ),
        );
        return /^entity-\d+:fnv1a:[a-f0-9]{8}$/.test(id);
      }),
    );
  });

  test('different component sets produce different composable ids when serialized content differs', () => {
    fc.assert(
      fc.property(arbEntityRecord, arbEntityRecord, (left, right) => {
        fc.pre(JSON.stringify(left) !== JSON.stringify(right));
        return Composable.make(left).id !== Composable.make(right).id;
      }),
    );
  });

});
