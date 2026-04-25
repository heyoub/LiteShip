/**
 * Dense component storage tests -- Float64Array-backed Part.dense()
 * and DenseSystem integration with World.tick().
 */

import { describe, test, expect } from 'vitest';
import { Effect, Scope, Schema } from 'effect';
import { Part, World } from '@czap/core';
import type { EntityId, DenseStore } from '@czap/core';

// ---------------------------------------------------------------------------
// Part.dense -- standalone store operations
// ---------------------------------------------------------------------------

describe('Part.dense -- DenseStore', () => {
  test('set/get roundtrip', () => {
    const store = Part.dense('velocity', 16);
    const id = 'e-test-000001' as EntityId;

    store.set(id, 42.5);
    expect(store.get(id)).toBe(42.5);
  });

  test('has returns true for stored, false for missing', () => {
    const store = Part.dense('hp', 8);
    const a = 'e-test-aaa' as EntityId;
    const b = 'e-test-bbb' as EntityId;

    store.set(a, 100);
    expect(store.has(a)).toBe(true);
    expect(store.has(b)).toBe(false);
  });

  test('get returns undefined for missing entity', () => {
    const store = Part.dense('hp', 8);
    expect(store.get('e-test-nope' as EntityId)).toBeUndefined();
  });

  test('set overwrites existing value', () => {
    const store = Part.dense('hp', 8);
    const id = 'e-test-overwrite' as EntityId;

    store.set(id, 10);
    store.set(id, 20);
    expect(store.get(id)).toBe(20);
    expect(store.count).toBe(1);
  });

  test('delete removes entity and swap-removes correctly', () => {
    const store = Part.dense('hp', 8);
    const a = 'e-a' as EntityId;
    const b = 'e-b' as EntityId;
    const c = 'e-c' as EntityId;

    store.set(a, 1);
    store.set(b, 2);
    store.set(c, 3);
    expect(store.count).toBe(3);

    // Delete the middle element -- last element swaps into its slot
    const deleted = store.delete(b);
    expect(deleted).toBe(true);
    expect(store.count).toBe(2);
    expect(store.has(b)).toBe(false);
    expect(store.get(b)).toBeUndefined();

    // a and c should still be accessible
    expect(store.get(a)).toBe(1);
    expect(store.get(c)).toBe(3);
  });

  test('delete last element works', () => {
    const store = Part.dense('hp', 8);
    const a = 'e-a' as EntityId;
    store.set(a, 99);
    store.delete(a);
    expect(store.count).toBe(0);
    expect(store.has(a)).toBe(false);
  });

  test('delete returns false for missing entity', () => {
    const store = Part.dense('hp', 8);
    expect(store.delete('e-nope' as EntityId)).toBe(false);
  });

  test('view returns a Float64Array subarray of live data', () => {
    const store = Part.dense('speed', 16);

    store.set('e-0' as EntityId, 10);
    store.set('e-1' as EntityId, 20);
    store.set('e-2' as EntityId, 30);

    const v = store.view();
    expect(v).toBeInstanceOf(Float64Array);
    expect(v.length).toBe(3);
    expect(Array.from(v)).toEqual([10, 20, 30]);
  });

  test('entities returns entity IDs in dense order', () => {
    const store = Part.dense('mass', 8);

    store.set('e-a' as EntityId, 1);
    store.set('e-b' as EntityId, 2);
    store.set('e-c' as EntityId, 3);

    const ents = store.entities();
    expect(ents).toEqual(['e-a', 'e-b', 'e-c']);
  });

  test('throws RangeError when capacity exceeded', () => {
    const store = Part.dense('tiny', 2);

    store.set('e-0' as EntityId, 1);
    store.set('e-1' as EntityId, 2);

    expect(() => store.set('e-2' as EntityId, 3)).toThrow(RangeError);
  });

  test('view updates after delete (swap-remove reflected)', () => {
    const store = Part.dense('x', 8);

    store.set('e-a' as EntityId, 100);
    store.set('e-b' as EntityId, 200);
    store.set('e-c' as EntityId, 300);

    store.delete('e-a' as EntityId);

    const v = store.view();
    expect(v.length).toBe(2);
    // After swap-remove of index 0: last element (300) moved to index 0, then 200 at index 1
    expect(store.get('e-c' as EntityId)).toBe(300);
    expect(store.get('e-b' as EntityId)).toBe(200);
  });

  test('name and capacity are preserved', () => {
    const store = Part.dense('gravity', 1024);
    expect(store.name).toBe('gravity');
    expect(store.capacity).toBe(1024);
  });
});

// ---------------------------------------------------------------------------
// World.tick() with dense systems
// ---------------------------------------------------------------------------

describe('World.tick() -- dense systems', () => {
  test('dense system iterates Float64Array in tick', () => {
    const result = Effect.runSync(
      Effect.scoped(
        Effect.gen(function* () {
          const world = yield* World.make();
          const velocityStore = Part.dense('velocity', 64);

          yield* world.addDenseStore(velocityStore);

          // Spawn entities and add to dense store
          const id1 = yield* world.spawn();
          const id2 = yield* world.spawn();
          const id3 = yield* world.spawn();

          velocityStore.set(id1, 10);
          velocityStore.set(id2, 20);
          velocityStore.set(id3, 30);

          let sum = 0;

          yield* world.addSystem({
            name: 'accumulator',
            query: ['velocity'],
            _denseSystem: true as const,
            execute(stores: ReadonlyMap<string, DenseStore>) {
              const vel = stores.get('velocity')!;
              const view = vel.view();
              for (let i = 0; i < view.length; i++) {
                sum += view[i]!;
              }
              return Effect.void;
            },
          });

          yield* world.tick();
          return sum;
        }),
      ),
    );

    expect(result).toBe(60);
  });

  test('dense system mutates data in-place via view', () => {
    Effect.runSync(
      Effect.scoped(
        Effect.gen(function* () {
          const world = yield* World.make();
          const posStore = Part.dense('posX', 64);

          yield* world.addDenseStore(posStore);

          const id1 = yield* world.spawn();
          const id2 = yield* world.spawn();

          posStore.set(id1, 0);
          posStore.set(id2, 100);

          yield* world.addSystem({
            name: 'mover',
            query: ['posX'],
            _denseSystem: true as const,
            execute(stores: ReadonlyMap<string, DenseStore>) {
              const pos = stores.get('posX')!;
              const data = pos.data;
              const len = pos.count;
              for (let i = 0; i < len; i++) {
                data[i] = data[i]! + 5;
              }
              return Effect.void;
            },
          });

          yield* world.tick();

          expect(posStore.get(id1)).toBe(5);
          expect(posStore.get(id2)).toBe(105);

          yield* world.tick();

          expect(posStore.get(id1)).toBe(10);
          expect(posStore.get(id2)).toBe(110);
        }),
      ),
    );
  });

  test('dense system skipped when queried store is missing', () => {
    Effect.runSync(
      Effect.scoped(
        Effect.gen(function* () {
          const world = yield* World.make();
          let called = false;

          yield* world.addSystem({
            name: 'ghost',
            query: ['nonexistent'],
            _denseSystem: true as const,
            execute() {
              called = true;
              return Effect.void;
            },
          });

          yield* world.tick();
          expect(called).toBe(false);
        }),
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// Mixed dense + regular systems in the same world
// ---------------------------------------------------------------------------

describe('World.tick() -- mixed dense + regular systems', () => {
  test('both system types run in a single tick', () => {
    const results: string[] = [];

    Effect.runSync(
      Effect.scoped(
        Effect.gen(function* () {
          const world = yield* World.make();
          const speedStore = Part.dense('speed', 32);
          yield* world.addDenseStore(speedStore);

          // Spawn an entity with a regular component
          const id = yield* world.spawn({ label: 'player' });
          speedStore.set(id, 9.8);

          // Regular system
          yield* world.addSystem({
            name: 'labeler',
            query: ['label'],
            execute(entities) {
              for (const e of entities) {
                results.push(`label:${e.components.get('label')}`);
              }
              return Effect.void;
            },
          });

          // Dense system
          yield* world.addSystem({
            name: 'speeder',
            query: ['speed'],
            _denseSystem: true as const,
            execute(stores: ReadonlyMap<string, DenseStore>) {
              const s = stores.get('speed')!;
              const v = s.view();
              for (let i = 0; i < v.length; i++) {
                results.push(`speed:${v[i]}`);
              }
              return Effect.void;
            },
          });

          yield* world.tick();
        }),
      ),
    );

    expect(results).toEqual(['label:player', 'speed:9.8']);
  });

  test('despawn cleans up dense stores', () => {
    Effect.runSync(
      Effect.scoped(
        Effect.gen(function* () {
          const world = yield* World.make();
          const store = Part.dense('hp', 16);
          yield* world.addDenseStore(store);

          const id = yield* world.spawn();
          store.set(id, 100);
          expect(store.has(id)).toBe(true);

          yield* world.despawn(id);
          expect(store.has(id)).toBe(false);
          expect(store.count).toBe(0);
        }),
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// Multi-store dense system queries
// ---------------------------------------------------------------------------

describe('Dense system -- multi-store query', () => {
  test('system receives multiple dense stores', () => {
    const result = Effect.runSync(
      Effect.scoped(
        Effect.gen(function* () {
          const world = yield* World.make();
          const posX = Part.dense('posX', 32);
          const velX = Part.dense('velX', 32);

          yield* world.addDenseStore(posX);
          yield* world.addDenseStore(velX);

          const id1 = yield* world.spawn();
          const id2 = yield* world.spawn();

          posX.set(id1, 0);
          posX.set(id2, 50);
          velX.set(id1, 1);
          velX.set(id2, -2);

          yield* world.addSystem({
            name: 'physics',
            query: ['posX', 'velX'],
            _denseSystem: true as const,
            execute(stores: ReadonlyMap<string, DenseStore>) {
              const pos = stores.get('posX')!;
              const vel = stores.get('velX')!;
              // Iterate entities from one store and look up in the other
              const ents = pos.entities();
              for (let i = 0; i < ents.length; i++) {
                const eid = ents[i]!;
                const v = vel.get(eid);
                if (v !== undefined) {
                  pos.set(eid, pos.get(eid)! + v);
                }
              }
              return Effect.void;
            },
          });

          yield* world.tick();

          return { p1: posX.get(id1), p2: posX.get(id2) };
        }),
      ),
    );

    expect(result.p1).toBe(1);
    expect(result.p2).toBe(48);
  });
});

// ---------------------------------------------------------------------------
// Entity ID uniqueness invariants
// ---------------------------------------------------------------------------

describe('World.spawn -- entity ID uniqueness', () => {
  test('spawn without components produces unique EntityIds', () => {
    Effect.runSync(
      Effect.scoped(
        Effect.gen(function* () {
          const world = yield* World.make();
          const id1 = yield* world.spawn();
          const id2 = yield* world.spawn();
          const id3 = yield* world.spawn();

          expect(id1).not.toBe(id2);
          expect(id2).not.toBe(id3);
          expect(id1).not.toBe(id3);
        }),
      ),
    );
  });

  test('spawn with identical components produces unique EntityIds', () => {
    Effect.runSync(
      Effect.scoped(
        Effect.gen(function* () {
          const world = yield* World.make();
          const id1 = yield* world.spawn({ type: 'bullet' });
          const id2 = yield* world.spawn({ type: 'bullet' });

          expect(id1).not.toBe(id2);
        }),
      ),
    );
  });
});
