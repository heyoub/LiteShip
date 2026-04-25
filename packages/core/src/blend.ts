/**
 * BlendTree -- weighted multi-state blending.
 *
 * A blend tree holds named numeric-record values with weights.
 * `compute()` returns the weighted average of all values.
 *
 * @module
 */

import type { Scope } from 'effect';
import { Effect, Stream, PubSub } from 'effect';

interface BlendNodeShape<T> {
  readonly value: T;
  readonly weight: number;
}

interface BlendTreeShape<T extends Record<string, number>> {
  add(name: string, value: T, weight: number): void;
  remove(name: string): void;
  setWeight(name: string, weight: number): void;
  compute(): T;
  readonly changes: Stream.Stream<T>;
}

/**
 * Creates a new BlendTree for weighted multi-state blending of numeric records.
 * Requires a Scope for lifecycle management of the change stream.
 *
 * @example
 * ```ts
 * const program = Effect.scoped(Effect.gen(function* () {
 *   const tree = yield* BlendTree.make<{ x: number; y: number }>();
 *   tree.add('idle', { x: 0, y: 0 }, 0.3);
 *   tree.add('active', { x: 100, y: 50 }, 0.7);
 *   const blended = tree.compute(); // { x: 70, y: 35 }
 * }));
 * ```
 */
function _make<T extends Record<string, number>>(): Effect.Effect<BlendTreeShape<T>, never, Scope.Scope> {
  return Effect.gen(function* () {
    const nodes = new Map<string, BlendNodeShape<T>>();
    const pubsub = yield* PubSub.unbounded<T>();

    // The computed result is a Record<string, number> whose keys match T's keys by
     // construction (we only write keys copied from node.value, which is T). TS can't
     // track that structural promise, so we contain one cast in a named helper.
    const finalizeBlend = (record: Record<string, number>): T => record as unknown as T;

    function computeBlend(): T {
      const result: Record<string, number> = {};
      let totalWeight = 0;

      for (const node of nodes.values()) {
        if (node.weight > 0) totalWeight += node.weight;
      }

      if (totalWeight === 0 || nodes.size === 0) {
        return finalizeBlend(result);
      }

      let initialized = false;
      for (const node of nodes.values()) {
        const w = node.weight > 0 ? node.weight / totalWeight : 0;
        for (const key in node.value) {
          if (Object.prototype.hasOwnProperty.call(node.value, key)) {
            if (!initialized || !(key in result)) {
              result[key] = 0;
            }
            result[key]! += node.value[key]! * w;
          }
        }
        initialized = true;
      }

      return finalizeBlend(result);
    }

    function notifyChange(): void {
      const blended = computeBlend();
      Effect.runSync(PubSub.publish(pubsub, blended));
    }

    const tree: BlendTreeShape<T> = {
      add(name: string, value: T, weight: number): void {
        nodes.set(name, { value, weight });
        notifyChange();
      },

      remove(name: string): void {
        nodes.delete(name);
        notifyChange();
      },

      setWeight(name: string, weight: number): void {
        const node = nodes.get(name);
        if (node) {
          nodes.set(name, { ...node, weight });
          notifyChange();
        }
      },

      compute(): T {
        return computeBlend();
      },

      changes: Stream.fromPubSub(pubsub),
    };

    return tree;
  });
}

/**
 * BlendTree -- weighted multi-state blending for numeric records.
 * Add named nodes with values and weights, then compute the weighted average.
 *
 * @example
 * ```ts
 * const program = Effect.scoped(Effect.gen(function* () {
 *   const tree = yield* BlendTree.make<{ opacity: number }>();
 *   tree.add('fadeIn', { opacity: 1 }, 0.8);
 *   tree.add('fadeOut', { opacity: 0 }, 0.2);
 *   const result = tree.compute(); // { opacity: 0.8 }
 * }));
 * ```
 */
export const BlendTree = { make: _make };

export declare namespace BlendTree {
  /** Structural shape of a blend-tree instance: `sample(weights)` over a `Record<string, number>` space. */
  export type Shape<T extends Record<string, number>> = BlendTreeShape<T>;
  /** Individual leaf/intermediate node in a blend tree. */
  export type Node<T> = BlendNodeShape<T>;
}
