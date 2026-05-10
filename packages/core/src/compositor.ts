/**
 * Compositor -- merge multiple quantizers into composite state.
 *
 * The compositor aggregates discrete + blended state from all
 * active quantizers into a single CompositeState, producing
 * typed output channels (css, glsl, aria).
 *
 * Wired: DirtyFlags (selective recomputation), CompositorStatePool
 * (zero-allocation), FrameBudget (priority scheduling), microtask batching,
 * and RuntimeCoordinator (Plan + ECS-backed runtime bookkeeping).
 *
 * Hot path (computeStateSync) is plain JS — no Effect overhead.
 * Effect is used only for resource lifecycle (create/scope) and
 * reactive stream (SubscriptionRef.changes).
 *
 * @module
 */

import type { Scope, Stream } from 'effect';
import { Effect, SubscriptionRef } from 'effect';
import type { Boundary } from './boundary.js';
import { COMPOSITOR_POOL_CAP, DIRTY_FLAGS_MAX } from './defaults.js';
import { CompositorStatePool, accessCompositeState } from './compositor-pool.js';
import { DirtyFlags } from './dirty.js';
import type { FrameBudget } from './frame-budget.js';
import type { Quantizer } from './quantizer-types.js';
import { RuntimeCoordinator } from './runtime-coordinator.js';
import { SpeculativeEvaluator } from './speculative.js';

/**
 * Snapshot of the compositor's output per tick: discrete state names for each
 * quantizer, their blend-weight vectors, and the compiled per-target output
 * maps (`css` / `glsl` / `aria`).
 */
export interface CompositeState {
  readonly discrete: Record<string, string>;
  readonly blend: Record<string, Record<string, number>>;
  readonly outputs: {
    readonly css: Record<string, number | string>;
    readonly glsl: Record<string, number>;
    readonly aria: Record<string, string>;
  };
}

/**
 * Options accepted by `Compositor.create`: pool capacity, optional
 * frame-budget gating, and whether to enable speculative pre-evaluation.
 */
export interface CompositorConfig {
  readonly poolCapacity?: number;
  readonly frameBudget?: FrameBudget.Shape;
  readonly speculative?: boolean;
}

/**
 * Widen a Quantizer's boundary parameter to Boundary.Shape for storage in
 * a heterogeneous registry. Safe because Quantizer<B> is covariant in B
 * (B only appears in return positions on Quantizer).
 */
function widenQuantizer<B extends Boundary.Shape>(q: Quantizer<B>): Quantizer<Boundary.Shape> {
  return q as unknown as Quantizer<Boundary.Shape>;
}

interface CompositorShape {
  add<B extends Boundary.Shape>(name: string, quantizer: Quantizer<B>): Effect.Effect<void>;
  remove(name: string): Effect.Effect<void>;
  compute(): Effect.Effect<CompositeState>;
  setBlendWeights(name: string, weights: Record<string, number>): Effect.Effect<void>;
  evaluateSpeculative(name: string, value: number, velocity?: number): void;
  scheduleBatch(): void;
  readonly changes: Stream.Stream<CompositeState>;
  readonly runtime: RuntimeCoordinator.Shape;
}

interface CompositorFactory {
  create(config?: CompositorConfig): Effect.Effect<CompositorShape, never, Scope.Scope>;
}

interface QuantizerMeta {
  readonly cssKey: string;
  readonly glslKey: string;
  readonly ariaKey: string;
  readonly oneHotWeights: Readonly<Record<string, Readonly<Record<string, number>>>>;
}

function emptyCompositeState(): CompositeState {
  return {
    discrete: {},
    blend: {},
    outputs: { css: {}, glsl: {}, aria: {} },
  };
}

const MAX_DIRTY_KEYS = DIRTY_FLAGS_MAX;

/**
 * Compositor — the live merge point for every attached {@link Quantizer}.
 *
 * `Compositor.create` hands back a scoped Effect that, when run inside a
 * `Scope`, produces a compositor bound to a {@link RuntimeCoordinator}. Adding
 * quantizers, marking dirty flags, and emitting CSS/GLSL/ARIA outputs all flow
 * through the zero-allocation hot path backed by {@link CompositorStatePool}.
 *
 * @example
 * ```ts
 * import { Effect } from 'effect';
 * import { Compositor } from '@czap/core';
 *
 * const program = Effect.scoped(Effect.gen(function* () {
 *   const compositor = yield* Compositor.create({ poolCapacity: 64, speculative: true });
 *   yield* compositor.add('viewport', viewportQuantizer);
 *   const state = yield* compositor.compute();
 *   // state.discrete.viewport === 'tablet'
 *   // state.outputs.css['--czap-viewport'] === 'tablet'
 * }));
 * ```
 */
export const Compositor: CompositorFactory = {
  /** Build a scoped compositor bound to a fresh {@link RuntimeCoordinator}. */
  create(config?: CompositorConfig): Effect.Effect<CompositorShape, never, Scope.Scope> {
    return Effect.gen(function* () {
      const stateRef = yield* SubscriptionRef.make<CompositeState>(emptyCompositeState());

      const qMap = new Map<string, Quantizer<Boundary.Shape>>();
      const metaMap = new Map<string, QuantizerMeta>();
      const overrides = new Map<string, Record<string, number>>();

      const pool = CompositorStatePool.make(config?.poolCapacity ?? COMPOSITOR_POOL_CAP);
      const frameBudget = config?.frameBudget;
      const useSpeculative = config?.speculative ?? false;
      const runtime = RuntimeCoordinator.create({
        capacity: Math.max(config?.poolCapacity ?? COMPOSITOR_POOL_CAP, MAX_DIRTY_KEYS + 8),
        name: 'czap-compositor-runtime',
      });

      const speculativeEvaluators = new Map<string, SpeculativeEvaluator.Shape<Boundary.Shape>>();
      const prefetchedStates = new Map<string, string>();

      let nameList: string[] = [];
      let dirty: DirtyFlags.Shape<string> | null = null;
      let recomputeAll = false;
      let previousState: CompositeState = emptyCompositeState();
      let priorPreviousState: CompositeState | null = null;
      let batchScheduled = false;
      function rebuildDirtyFlags(): void {
        if (nameList.length > MAX_DIRTY_KEYS) {
          dirty = null;
          recomputeAll = true;
          return;
        }

        dirty = DirtyFlags.make(nameList);
        recomputeAll = false;
        for (const name of nameList) {
          dirty.mark(name);
          runtime.markDirty(name);
        }
      }

      function computeStateSync(): CompositeState {
        const dirtyFlags = dirty;
        const dirtyNames = recomputeAll || dirtyFlags === null ? Array.from(qMap.keys()) : dirtyFlags.getDirty();
        const shouldRecompute =
          recomputeAll || dirtyFlags === null ? () => true : (name: string) => dirtyFlags.isDirty(name);

        const state = pool.acquire();
        const { discrete, blend, css, glsl, aria } = accessCompositeState(state);

        for (const [name] of qMap) {
          if (shouldRecompute(name)) {
            continue;
          }

          const meta = metaMap.get(name)!;
          const previousDiscrete = previousState.discrete[name];
          if (previousDiscrete !== undefined) {
            discrete[name] = previousDiscrete;
          }

          const previousBlend = previousState.blend[name]!;
          blend[name] = previousBlend;

          const previousCss = previousState.outputs.css[meta.cssKey];
          if (previousCss !== undefined) {
            css[meta.cssKey] = previousCss;
          }

          const previousGlsl = previousState.outputs.glsl[meta.glslKey];
          if (previousGlsl !== undefined) {
            glsl[meta.glslKey] = previousGlsl;
          }

          const previousAria = previousState.outputs.aria[meta.ariaKey];
          if (previousAria !== undefined) {
            aria[meta.ariaKey] = previousAria;
          }
        }

        for (const phase of runtime.phases) {
          switch (phase) {
            case 'compute-discrete':
              for (const name of dirtyNames) {
                const quantizer = qMap.get(name)!;

                const prefetched = prefetchedStates.get(name);
                const stateStr =
                  prefetched ?? (quantizer.stateSync ? quantizer.stateSync() : Effect.runSync(quantizer.state));
                discrete[name] = stateStr;
                runtime.setState(name, stateStr);
                prefetchedStates.delete(name);
              }
              break;

            case 'compute-blend':
              for (const name of dirtyNames) {
                const meta = metaMap.get(name)!;

                const override = overrides.get(name);
                if (override !== undefined) {
                  blend[name] = override;
                  continue;
                }

                blend[name] = meta.oneHotWeights[discrete[name] ?? ''] ?? {};
              }
              break;

            case 'emit-css':
              for (const name of dirtyNames) {
                const meta = metaMap.get(name);
                const stateStr = discrete[name];
                if (stateStr !== undefined && meta) {
                  css[meta.cssKey] = stateStr;
                }
              }
              break;

            case 'emit-glsl':
              if (!frameBudget || frameBudget.canRun('high')) {
                for (const name of dirtyNames) {
                  const meta = metaMap.get(name)!;
                  glsl[meta.glslKey] = runtime.getStateIndex(name);
                }
              }
              break;

            case 'emit-aria':
              if (!frameBudget || frameBudget.canRun('low')) {
                for (const name of dirtyNames) {
                  const meta = metaMap.get(name)!;
                  const stateStr = discrete[name];
                  if (stateStr !== undefined) {
                    aria[meta.ariaKey] = stateStr;
                  }
                }
              }
              break;
          }
        }

        if (dirty) {
          dirty.clearAll();
        }

        // Two-slot rotation: the most-recently-published state stays readable for one
        // more tick (so consumers who hold a reference returned from compute() see live
        // data until the *next-next* publish). Without this rotation, every tick takes
        // the overflow path in CompositorStatePool.acquire and the pool grows unboundedly.
        const releasable = priorPreviousState;
        priorPreviousState = previousState;
        previousState = state;
        Effect.runSync(SubscriptionRef.set(stateRef, state));
        if (releasable && releasable !== state) pool.release(releasable);
        return state;
      }

      const compositor: CompositorShape = {
        add: <B extends Boundary.Shape>(name: string, quantizer: Quantizer<B>) =>
          Effect.sync(() => {
            // Quantizer<B> is covariant in B (B only appears in return types), so widening
            // to Quantizer<Boundary.Shape> is sound; wrap in a named helper to document.
            qMap.set(name, widenQuantizer(quantizer));
            metaMap.set(name, {
              cssKey: `--czap-${name}`,
              glslKey: `u_${name}`,
              ariaKey: `data-czap-${name}`,
              oneHotWeights: Object.fromEntries(
                quantizer.boundary.states.map((activeState) => [
                  activeState as string,
                  Object.freeze(
                    Object.fromEntries(
                      quantizer.boundary.states.map((stateName) => [
                        stateName as string,
                        stateName === activeState ? 1 : 0,
                      ]),
                    ),
                  ),
                ]),
              ),
            });
            runtime.registerQuantizer(name, quantizer.boundary.states as readonly string[]);
            runtime.markDirty(name);

            if (!nameList.includes(name)) {
              nameList.push(name);
              rebuildDirtyFlags();
            }
            if (dirty) {
              dirty.mark(name);
            }

            if (useSpeculative) {
              speculativeEvaluators.set(name, SpeculativeEvaluator.make(quantizer.boundary));
            }

            computeStateSync();
          }),

        remove: (name: string) =>
          Effect.sync(() => {
            qMap.delete(name);
            metaMap.delete(name);
            nameList = nameList.filter((entry) => entry !== name);
            rebuildDirtyFlags();
            runtime.removeQuantizer(name);
            speculativeEvaluators.delete(name);
            prefetchedStates.delete(name);
            computeStateSync();
          }),

        compute: () => Effect.sync(() => computeStateSync()),

        setBlendWeights: (name: string, weights: Record<string, number>) =>
          Effect.sync(() => {
            overrides.set(name, weights);
            if (dirty) {
              dirty.mark(name);
            }
            runtime.markDirty(name);
          }),

        evaluateSpeculative(name: string, value: number, velocity?: number): void {
          const speculative = speculativeEvaluators.get(name);
          if (!speculative) {
            return;
          }

          const result = speculative.evaluate(value, velocity);
          if (result.prefetched && result.confidence > 0.7) {
            prefetchedStates.set(name, result.prefetched as string);
            runtime.markDirty(name);
            if (dirty) {
              dirty.mark(name);
            }
            return;
          }

          prefetchedStates.delete(name);
        },

        scheduleBatch(): void {
          if (batchScheduled) {
            return;
          }

          batchScheduled = true;
          queueMicrotask(() => {
            batchScheduled = false;
            computeStateSync();
          });
        },

        changes: SubscriptionRef.changes(stateRef),
        runtime,
      };

      return compositor;
    });
  },
};

export declare namespace Compositor {
  /** Structural shape of a live compositor instance. */
  export type Shape = CompositorShape;
  /** Alias for {@link CompositorConfig}. */
  export type Config = CompositorConfig;
}
