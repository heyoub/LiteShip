/**
 * ECS -- Entity, Part, System, World.
 *
 * Composition over inheritance. Entities are bags of parts,
 * systems operate on entities matching part queries.
 *
 * @module
 */

import type { Scope, Schema } from 'effect';
import { Effect, Ref } from 'effect';

/** Nominal-typed identifier for an ECS entity — a branded string minted via the {@link EntityId} helper. */
export type EntityId = string & { readonly _brand: 'EntityId' };

/** Brand an arbitrary string as an `EntityId`. Sanctioned single-site cast. */
export const EntityId = (value: string): EntityId => value as EntityId;

import { fnv1a } from './fnv.js';

interface EntityShape {
  readonly id: EntityId;
  readonly components: ReadonlyMap<string, unknown>;
}

interface PartShape<T = unknown> {
  readonly name: string;
  readonly schema: Schema.Schema<T>;
}

// ---------------------------------------------------------------------------
// Dense Component Storage -- Float64Array-backed, zero-allocation iteration
// ---------------------------------------------------------------------------

const DENSE_SENTINEL = -Infinity;

interface DenseStoreShape {
  readonly name: string;
  readonly capacity: number;
  readonly _dense: true;
  /** Entity ID `->` index in the data array */
  readonly entityToIndex: Map<EntityId, number>;
  /** Index `->` Entity ID (for iteration) */
  readonly indexToEntity: EntityId[];
  /** The raw Float64Array backing store */
  readonly data: Float64Array;
  /** Current number of live entries */
  count: number;

  get(entityId: EntityId): number | undefined;
  set(entityId: EntityId, value: number): void;
  has(entityId: EntityId): boolean;
  delete(entityId: EntityId): boolean;
  reset(): void;
  /** Direct typed array view for tight-loop iteration (length = count) */
  view(): Float64Array;
  /** All entity IDs with values, in dense order */
  entities(): readonly EntityId[];
}

function _makeDenseStore(name: string, capacity: number): DenseStoreShape {
  const entityToIndex = new Map<EntityId, number>();
  const indexToEntity: EntityId[] = [];
  const data = new Float64Array(capacity);
  data.fill(DENSE_SENTINEL);

  const store: DenseStoreShape = {
    name,
    capacity,
    _dense: true,
    entityToIndex,
    indexToEntity,
    data,
    count: 0,

    get(entityId: EntityId): number | undefined {
      const idx = entityToIndex.get(entityId);
      if (idx === undefined) return undefined;
      return data[idx];
    },

    set(entityId: EntityId, value: number): void {
      let idx = entityToIndex.get(entityId);
      if (idx !== undefined) {
        data[idx] = value;
        return;
      }
      if (store.count >= capacity) {
        throw new RangeError(`Dense store "${name}" at capacity (${capacity}). Cannot add entity ${entityId}.`);
      }
      idx = store.count;
      entityToIndex.set(entityId, idx);
      indexToEntity[idx] = entityId;
      data[idx] = value;
      store.count++;
    },

    has(entityId: EntityId): boolean {
      return entityToIndex.has(entityId);
    },

    delete(entityId: EntityId): boolean {
      const idx = entityToIndex.get(entityId);
      if (idx === undefined) return false;

      const lastIdx = store.count - 1;
      if (idx !== lastIdx) {
        // Swap-remove: move last element into the vacated slot
        const lastEntity = indexToEntity[lastIdx]!;
        data[idx] = data[lastIdx]!;
        indexToEntity[idx] = lastEntity;
        entityToIndex.set(lastEntity, idx);
      }
      data[lastIdx] = DENSE_SENTINEL;
      indexToEntity.length = lastIdx;
      entityToIndex.delete(entityId);
      store.count--;
      return true;
    },

    reset(): void {
      entityToIndex.clear();
      indexToEntity.length = 0;
      data.fill(DENSE_SENTINEL);
      store.count = 0;
    },

    view(): Float64Array {
      return data.subarray(0, store.count);
    },

    entities(): readonly EntityId[] {
      return indexToEntity;
    },
  };

  return store;
}

// ---------------------------------------------------------------------------
// Dense System -- operates directly on Float64Array data
// ---------------------------------------------------------------------------

interface DenseSystemShape {
  readonly name: string;
  readonly query: readonly string[];
  readonly _denseSystem: true;
  /**
   * Execute receives dense stores keyed by component name.
   * Systems iterate the typed arrays directly -- zero allocation per tick.
   */
  execute(stores: ReadonlyMap<string, DenseStoreShape>): Effect.Effect<void>;
}

// ---------------------------------------------------------------------------
// System types
// ---------------------------------------------------------------------------

interface SystemShape {
  readonly name: string;
  readonly query: readonly string[];
  readonly _denseSystem?: undefined;
  /** Second argument is the world — use it to write computed output components back. */
  execute(entities: readonly EntityShape[], world?: WorldShape): Effect.Effect<void>;
}

type AnySystemShape = SystemShape | DenseSystemShape;

// ---------------------------------------------------------------------------
// World
// ---------------------------------------------------------------------------

interface WorldShape {
  spawn(components?: Record<string, unknown>): Effect.Effect<EntityId>;
  despawn(id: EntityId): Effect.Effect<void>;
  addComponent<T>(id: EntityId, component: PartShape<T>, value: T): Effect.Effect<void>;
  /** Schema-free component write — used by systems to persist computed output values. */
  setComponent(id: EntityId, name: string, value: unknown): Effect.Effect<void>;
  removeComponent(id: EntityId, name: string): Effect.Effect<void>;
  query(...componentNames: string[]): Effect.Effect<readonly EntityShape[]>;
  addSystem(system: AnySystemShape): Effect.Effect<void>;
  tick(): Effect.Effect<void>;
  /** Register a dense store so the world can wire it into dense systems */
  addDenseStore(store: DenseStoreShape): Effect.Effect<void>;
}

function _makeWorld(): Effect.Effect<WorldShape, never, Scope.Scope> {
  return Effect.gen(function* () {
    const entitiesRef = yield* Ref.make<Map<EntityId, Map<string, unknown>>>(new Map());
    const systemsRef = yield* Ref.make<AnySystemShape[]>([]);
    const denseStoresRef = yield* Ref.make<Map<string, DenseStoreShape>>(new Map());
    let nextEntitySeq = 0;

    const world: WorldShape = {
      spawn(components?: Record<string, unknown>): Effect.Effect<EntityId> {
        return Effect.gen(function* () {
          const seq = nextEntitySeq++;
          const id = EntityId(`entity-${seq}:${fnv1a(JSON.stringify(components ?? {}))}`);
          const componentMap = new Map<string, unknown>();
          if (components) {
            for (const [name, value] of Object.entries(components)) {
              componentMap.set(name, value);
            }
          }
          yield* Ref.update(entitiesRef, (m) => {
            const next = new Map(m);
            next.set(id, componentMap);
            return next;
          });
          return id;
        });
      },

      despawn(id: EntityId): Effect.Effect<void> {
        return Effect.gen(function* () {
          // Remove from entity map
          yield* Ref.update(entitiesRef, (m) => {
            const next = new Map(m);
            next.delete(id);
            return next;
          });
          // Remove from all dense stores
          const denseStores = yield* Ref.get(denseStoresRef);
          for (const store of denseStores.values()) {
            store.delete(id);
          }
        });
      },

      addComponent<T>(id: EntityId, component: PartShape<T>, value: T): Effect.Effect<void> {
        return Ref.update(entitiesRef, (m) => {
          const next = new Map(m);
          const entity = next.get(id);
          if (entity) {
            const updated = new Map(entity);
            updated.set(component.name, value);
            next.set(id, updated);
          }
          return next;
        });
      },

      setComponent(id: EntityId, name: string, value: unknown): Effect.Effect<void> {
        return Ref.update(entitiesRef, (m) => {
          const next = new Map(m);
          const entity = next.get(id);
          if (entity) {
            const updated = new Map(entity);
            updated.set(name, value);
            next.set(id, updated);
          }
          return next;
        });
      },

      removeComponent(id: EntityId, name: string): Effect.Effect<void> {
        return Ref.update(entitiesRef, (m) => {
          const next = new Map(m);
          const entity = next.get(id);
          if (entity) {
            const updated = new Map(entity);
            updated.delete(name);
            next.set(id, updated);
          }
          return next;
        });
      },

      query(...componentNames: string[]): Effect.Effect<readonly EntityShape[]> {
        return Effect.gen(function* () {
          const entities = yield* Ref.get(entitiesRef);
          const results: EntityShape[] = [];

          for (const [id, components] of entities) {
            const hasAll = componentNames.every((name) => components.has(name));
            if (hasAll) {
              const componentsCopy = new Map(components) as ReadonlyMap<string, unknown>;
              // Spread component values as direct properties so systems can access
              // computed output fields (e.g. `_opacity`, `_phase`, `_blend`) directly.
              const entity = Object.assign(
                { id, components: componentsCopy },
                Object.fromEntries(componentsCopy),
              ) as EntityShape;
              results.push(entity);
            }
          }

          return results;
        });
      },

      addSystem(system: AnySystemShape): Effect.Effect<void> {
        return Ref.update(systemsRef, (systems) => [...systems, system]);
      },

      addDenseStore(store: DenseStoreShape): Effect.Effect<void> {
        return Ref.update(denseStoresRef, (m) => {
          const next = new Map(m);
          next.set(store.name, store);
          return next;
        });
      },

      tick(): Effect.Effect<void> {
        return Effect.gen(function* () {
          const systems = yield* Ref.get(systemsRef);
          const denseStores = yield* Ref.get(denseStoresRef);

          for (const system of systems) {
            if (isDenseSystem(system)) {
              // Dense path: collect the stores this system queries
              const queriedStores = new Map<string, DenseStoreShape>();
              for (const name of system.query) {
                const store = denseStores.get(name);
                if (store) queriedStores.set(name, store);
              }
              // Only execute if all queried stores exist
              if (queriedStores.size === system.query.length) {
                yield* system.execute(queriedStores);
              }
            } else {
              // Regular path: entity-component query
              const matched = yield* world.query(...system.query);
              yield* system.execute(matched, world);
            }
          }
        });
      },
    };

    return world;
  });
}

function isDenseSystem(system: AnySystemShape): system is DenseSystemShape {
  return '_denseSystem' in system && system._denseSystem === true;
}

// ---------------------------------------------------------------------------
// Part namespace -- factories and types
// ---------------------------------------------------------------------------

function _makeDensePart(name: string, capacity: number): DenseStoreShape {
  return _makeDenseStore(name, capacity);
}

/**
 * Part namespace — factories for ECS component stores.
 *
 * Currently exposes the dense `Float64Array`-backed store used for hot-path
 * numeric state; sparse/object-valued parts are registered ad-hoc via
 * {@link World}.`addComponent`.
 */
export const Part = {
  /** Allocate a dense component store with fixed capacity. */
  dense: _makeDensePart,
} as { dense: (name: string, capacity: number) => DenseStoreShape } & Record<string, never>;

/** World namespace — construct the ECS world that ticks systems over entities. */
export const World = {
  /** Scoped Effect that produces a fresh ECS {@link World.Shape}. */
  make: _makeWorld,
};

export declare namespace Part {
  /** Structural shape of a typed component definition (`name` + schema). */
  export type Shape<T = unknown> = PartShape<T>;
  /** Alias for the dense `Float64Array`-backed store. */
  export type Dense = DenseStoreShape;
}

export declare namespace World {
  /** Structural shape of an ECS world: spawn/despawn, components, queries, systems, tick. */
  export type Shape = WorldShape;
}

export type {
  EntityShape as Entity,
  SystemShape as System,
  DenseSystemShape as DenseSystem,
  DenseStoreShape as DenseStore,
};
