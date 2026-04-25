/**
 * Composable -- ECS Composition over Existing Primitives
 *
 * Universal composition API leveraging existing deterministic primitives.
 * Zero boilerplate, type-safe, content-addressed entity composition.
 *
 * @module
 */

import type { ContentAddress } from './brands.js';
import type { Token } from './token.js';
import type { Style } from './style.js';
import type { World } from './ecs.js';
import type { EntityId } from './ecs.js';
import { Token as TokenNS } from './token.js';
import { Style as StyleNS } from './style.js';
import { Boundary } from './boundary.js';
import { Part } from './ecs.js';
import { fnv1aBytes } from './fnv.js';
import { TypedRef } from './typed-ref.js';
import { Effect } from 'effect';

// ---------------------------------------------------------------------------
// Entity Composition Types
// ---------------------------------------------------------------------------

/**
 * Component map for a {@link ComposableEntity} — well-known slots for czap
 * primitives plus arbitrary user-defined keys.
 */
export interface EntityComponents {
  readonly boundary?: Boundary.Shape;
  readonly token?: Token.Shape;
  readonly style?: Style.Shape;
  readonly [key: string]: unknown;
}

/**
 * Content-addressed entity: the identity is an FNV-1a hash over its components,
 * so two entities with structurally equal components share the same `id`.
 */
export interface ComposableEntity<T extends EntityComponents = EntityComponents> {
  readonly id: ContentAddress;
  readonly components: T;
  readonly _tag: 'ComposableEntity';
}

// ---------------------------------------------------------------------------
// Composable Factory
// ---------------------------------------------------------------------------

interface ComposableFactory {
  make<T extends EntityComponents>(components: T): ComposableEntity<T>;
  compose<T extends EntityComponents>(entity1: ComposableEntity<T>, entity2: ComposableEntity<T>): ComposableEntity<T>;
  merge<T extends EntityComponents>(...entities: ComposableEntity<T>[]): ComposableEntity<T>;
}

function makeEntityId(components: EntityComponents): ContentAddress {
  const canonical = canonicalizeForAddress(components);
  return fnv1aBytes(TypedRef.canonicalize(canonical));
}

function canonicalizeForAddress(value: unknown): unknown {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => {
      const canonical = canonicalizeForAddress(entry);
      return canonical === undefined ? null : canonical;
    });
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalizeForAddress(entry)]);

    return Object.fromEntries(entries);
  }

  return String(value);
}

function _make<T extends EntityComponents>(components: T): ComposableEntity<T> {
  const id = makeEntityId(components);

  return {
    id,
    components,
    _tag: 'ComposableEntity',
  };
}

function _compose<T extends EntityComponents>(
  entity1: ComposableEntity<T>,
  entity2: ComposableEntity<T>,
): ComposableEntity<T> {
  // Merge components with entity2 taking precedence
  const merged = { ...entity1.components, ...entity2.components };
  return _make(merged);
}

function _merge<T extends EntityComponents>(...entities: ComposableEntity<T>[]): ComposableEntity<T> {
  if (entities.length === 0) {
    throw new Error('Cannot merge zero entities');
  }
  const first = entities[0];
  if (!first) {
    throw new Error('First entity is undefined');
  }
  return entities.slice(1).reduce((acc, entity) => _compose(acc, entity), first);
}

// ---------------------------------------------------------------------------
// ECS Integration
// ---------------------------------------------------------------------------

/**
 * Convert a runtime `Map<string, unknown>` (from ECS query results) into a typed
 * `Pick<Schema, K>`. The ECS query filters guarantee the required keys are present;
 * this helper contains the one boundary cast where runtime shape joins the type lattice.
 */
function entriesToPick<Schema extends EntityComponents, K extends keyof Schema>(
  components: ReadonlyMap<string, unknown>,
): Pick<Schema, K> {
  return Object.fromEntries(components) as Pick<Schema, K>;
}

interface TypedComposableWorld<Schema extends EntityComponents = EntityComponents> {
  spawn<T extends Schema>(components: T): Effect.Effect<ComposableEntity<T>>;
  spawnWith<T extends Schema>(entity: ComposableEntity<T>): Effect.Effect<ComposableEntity<T>>;
  query<K extends keyof Schema>(...componentTypes: K[]): Effect.Effect<readonly ComposableEntity<Pick<Schema, K>>[]>;
  evaluate<T extends Schema>(
    entity: ComposableEntity<T>,
    input: Record<string, number>,
  ): Effect.Effect<Record<string, string>>;
}

function makeComposableWorld<Schema extends EntityComponents = EntityComponents>(
  world: World.Shape,
): TypedComposableWorld<Schema> {
  // Mapping from ContentAddress to ECS EntityId for query reconstruction
  const addressToEntityId = new Map<ContentAddress, EntityId>();

  return {
    spawn<T extends Schema>(components: T): Effect.Effect<ComposableEntity<T>> {
      return Effect.gen(function* () {
        const entity = _make(components);
        const ecsId = yield* world.spawn(components);
        addressToEntityId.set(entity.id, ecsId);
        return entity;
      });
    },

    spawnWith<T extends Schema>(entity: ComposableEntity<T>): Effect.Effect<ComposableEntity<T>> {
      return Effect.gen(function* () {
        const ecsId = yield* world.spawn(entity.components);
        addressToEntityId.set(entity.id, ecsId);
        return entity;
      });
    },

    query<K extends keyof Schema>(...componentTypes: K[]): Effect.Effect<readonly ComposableEntity<Pick<Schema, K>>[]> {
      return Effect.gen(function* () {
        const names = [...componentTypes].map((k) => String(k)).sort();
        const entities = yield* world.query(...names);
        return [...entities]
          .sort((left, right) => left.id.localeCompare(right.id))
          .map((entityShape) => {
            // world.query guarantees entityShape.components contains at least the K keys
            // that were queried for; convert the runtime Map<string, unknown> to the typed
            // Pick<Schema, K> via a single contained cast (runtime shape is validated by
            // the ECS query filter).
            const components = entriesToPick<Schema, K>(entityShape.components);
            return _make(components);
          });
      });
    },

    evaluate<T extends Schema>(
      entity: ComposableEntity<T>,
      input: Record<string, number>,
    ): Effect.Effect<Record<string, string>> {
      return Effect.gen(function* () {
        const results: Record<string, string> = {};

        // Evaluate boundary component: quantize continuous input to discrete state
        let boundaryState: string | undefined;
        if (entity.components.boundary) {
          const boundary = entity.components.boundary;
          const boundaryInput = input[boundary.input] ?? 0;
          const state = Boundary.evaluate(boundary, boundaryInput);
          results[boundary.input] = state;
          boundaryState = state;
        }

        // Evaluate token component: resolve axis values or fall back
        if (entity.components.token) {
          const token = entity.components.token;
          // Build axis values from input keys. Token.tap expects string axis values,
          // so we convert matching numeric inputs to strings.
          const axisValues: Record<string, string> = {};
          for (const axis of token.axes) {
            if (axis in input) {
              axisValues[axis] = String(input[axis]);
            }
          }
          // Use Token.tap for proper axis-key lookup with fallback
          const resolved = TokenNS.tap(token, axisValues);
          results[token.name] = String(resolved);
        }

        // Evaluate style component: resolve properties for the current boundary state
        if (entity.components.style) {
          const style = entity.components.style;
          const resolvedProps = StyleNS.tap(style, boundaryState);
          for (const [prop, val] of Object.entries(resolvedProps)) {
            results[prop] = val;
          }
        }

        return results;
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Dense Store Integration
// ---------------------------------------------------------------------------

interface ComposableDenseStore {
  create(name: string, capacity: number): Effect.Effect<Part.Dense>;
  store<T extends EntityComponents>(entity: ComposableEntity<T>, value: number): Effect.Effect<void>;
  retrieve<T extends EntityComponents>(entity: ComposableEntity<T>): Effect.Effect<number | undefined>;
}

function makeComposableDenseStore(world: World.Shape): ComposableDenseStore {
  // Maintain a mapping from ContentAddress to ECS EntityId for dense store ops
  const addressToEntityId = new Map<ContentAddress, EntityId>();
  let denseStore: Part.Dense | undefined;

  return {
    create(name: string, capacity: number): Effect.Effect<Part.Dense> {
      return Effect.gen(function* () {
        const store = Part.dense(name, capacity);
        yield* world.addDenseStore(store);
        denseStore = store;
        return store;
      });
    },

    store<T extends EntityComponents>(entity: ComposableEntity<T>, value: number): Effect.Effect<void> {
      return Effect.gen(function* () {
        if (!denseStore) {
          throw new Error('No dense store created. Call create() first.');
        }
        // Ensure we have an ECS EntityId for this composable entity
        let ecsId = addressToEntityId.get(entity.id);
        if (!ecsId) {
          // Spawn into the world to get an EntityId, then track mapping
          ecsId = yield* world.spawn(entity.components);
          addressToEntityId.set(entity.id, ecsId);
        }
        denseStore.set(ecsId, value);
      });
    },

    retrieve<T extends EntityComponents>(entity: ComposableEntity<T>): Effect.Effect<number | undefined> {
      return Effect.gen(function* () {
        if (!denseStore) {
          return undefined;
        }
        const ecsId = addressToEntityId.get(entity.id);
        if (!ecsId) {
          return undefined;
        }
        return denseStore.get(ecsId);
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * Composable — content-addressed entity algebra over czap primitives.
 *
 * Build entities from a bag of components (boundaries, tokens, styles, …),
 * merge them associatively via `Composable.compose` / `Composable.merge`, and
 * rely on the content address to deduplicate structurally-equal entities.
 */
export const Composable: ComposableFactory = {
  /** Content-address a component bag into a {@link ComposableEntity}. */
  make: _make,
  /** Pairwise merge — right-biased; produces a new entity with a fresh content address. */
  compose: _compose,
  /** Variadic `Composable.compose`. Throws if called with zero entities. */
  merge: _merge,
};

/**
 * Bridge between a raw ECS {@link World} and typed {@link ComposableEntity}
 * operations (`spawn`, `query`, `evaluate`) plus a thin dense-store integration.
 */
export const ComposableWorld = {
  /** Wrap a {@link World} with the typed composable-entity API. */
  make: makeComposableWorld,
  /** Build a dense-store bridge over a {@link World} for per-entity numeric data. */
  dense: makeComposableDenseStore,
};

export declare namespace ComposableWorld {
  /** Structural shape of the typed world returned by {@link ComposableWorld.make}. */
  export type Shape<Schema extends EntityComponents = EntityComponents> = TypedComposableWorld<Schema>;
}

// Type exports -- keep legacy alias for backward compatibility
export type { TypedComposableWorld as ComposableWorldShape };
