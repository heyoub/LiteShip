/**
 * Core primitive benchmarks -- Boundary, Token, BlendTree, Compositor, ECS.
 */

import { Bench } from 'tinybench';
import { Effect, Scope, Schema } from 'effect';
import { Boundary, Token, Compositor, BlendTree, World, Part } from '@czap/core';

const bench = new Bench({ warmupIterations: 100 });

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const boundary3 = Boundary.make({
  input: 'viewport.width',
  at: [
    [0, 'mobile'],
    [768, 'tablet'],
    [1280, 'desktop'],
  ] as const,
});

const boundary5 = Boundary.make({
  input: 'viewport.width',
  at: [
    [0, 'xs'],
    [480, 'sm'],
    [768, 'md'],
    [1024, 'lg'],
    [1440, 'xl'],
  ] as const,
});

const boundary10 = Boundary.make({
  input: 'viewport.width',
  at: [
    [0, 's0'],
    [100, 's1'],
    [200, 's2'],
    [300, 's3'],
    [400, 's4'],
    [500, 's5'],
    [600, 's6'],
    [700, 's7'],
    [800, 's8'],
    [900, 's9'],
  ] as const,
});

const boundaryHyst = Boundary.make({
  input: 'viewport.width',
  at: [
    [0, 'mobile'],
    [768, 'tablet'],
    [1280, 'desktop'],
  ] as const,
  hysteresis: 50,
});

// ---------------------------------------------------------------------------
// Benchmarks
// ---------------------------------------------------------------------------

bench.add('Boundary.make() -- 3 thresholds', () => {
  Boundary.make({
    input: 'viewport.width',
    at: [
      [0, 'mobile'],
      [768, 'tablet'],
      [1280, 'desktop'],
    ] as const,
  });
});

bench.add('Boundary.evaluate -- 3 thresholds', () => {
  Boundary.evaluate(boundary3, 800);
});

bench.add('Boundary.evaluate -- 5 thresholds', () => {
  Boundary.evaluate(boundary5, 800);
});

bench.add('Boundary.evaluate -- 10 thresholds', () => {
  Boundary.evaluate(boundary10, 550);
});

bench.add('Boundary.evaluateWithHysteresis -- 3 thresholds', () => {
  Boundary.evaluateWithHysteresis(boundaryHyst, 780, 'mobile');
});

bench.add('Token.make() + FNV-1a', () => {
  Token.make({
    name: 'primary',
    category: 'color',
    axes: ['theme'] as const,
    values: { dark: '#00e5ff', light: '#00c4d4' },
    fallback: '#00e5ff',
  });
});

bench.add('BlendTree.compute() -- 4 nodes', () => {
  const tree = Effect.runSync(Effect.scoped(BlendTree.make<{ x: number; y: number }>()));
  tree.add('a', { x: 0, y: 0 }, 1);
  tree.add('b', { x: 100, y: 100 }, 1);
  tree.add('c', { x: 50, y: 50 }, 0.5);
  tree.add('d', { x: 75, y: 25 }, 0.5);
  tree.compute();
});

bench.add('Compositor.compute() -- empty', () => {
  const compositor = Effect.runSync(Effect.scoped(Compositor.create()));
  Effect.runSync(compositor.compute());
});

// ECS World tick -- setup extracted so only tick() is measured per iteration
{
  const world100 = Effect.runSync(
    Effect.scoped(
      Effect.gen(function* () {
        const world = yield* World.make();
        for (let i = 0; i < 100; i++) {
          yield* world.spawn({ position: { x: i, y: i * 2 } });
        }
        yield* world.addSystem({
          name: 'mover',
          query: ['position'],
          execute: () => Effect.void,
        });
        return world;
      }),
    ),
  );

  bench.add('ECS World tick -- 100 entities, 1 system', () => {
    Effect.runSync(world100.tick());
  });
}

{
  const scope = Effect.runSync(Scope.make());
  const {
    world: world100Dense,
    posX,
    posY,
  } = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const world = yield* World.make();
        const px = Part.dense('posX', 128);
        const py = Part.dense('posY', 128);

        yield* world.addDenseStore(px);
        yield* world.addDenseStore(py);

        for (let i = 0; i < 100; i++) {
          const id = yield* world.spawn();
          px.set(id, i);
          py.set(id, i * 2);
        }

        yield* world.addSystem({
          name: 'mover',
          query: ['posX', 'posY'],
          _denseSystem: true as const,
          execute(stores) {
            const pxStore = stores.get('posX')!;
            const pyStore = stores.get('posY')!;
            const xData = pxStore.data;
            const yData = pyStore.data;
            const len = pxStore.count;
            for (let i = 0; i < len; i++) {
              xData[i] = xData[i]! + 1;
              yData[i] = yData[i]! + 1;
            }
            return Effect.void;
          },
        });

        return { world, posX: px, posY: py };
      }),
    ),
  );

  bench.add('ECS World tick -- 100 entities, 1 system (dense)', () => {
    Effect.runSync(world100Dense.tick());
  });

  void scope;
  void posX;
  void posY;
}

// TODO(bang2/task8): uncomment when Config.make() is implemented
// import { Config } from '@czap/core';
// const testCfg = Config.make({ boundaries: { viewport: boundary3 } });
// bench.add('Config.make() -- empty config', () => { Config.make({}); });
// bench.add('Config.make() -- with boundaries', () => { Config.make({ boundaries: { viewport: boundary3, layout: boundary5 } }); });
// bench.add('Config.toViteConfig() -- projection', () => { Config.toViteConfig(testCfg); });

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

await bench.run();
console.table(bench.table());
