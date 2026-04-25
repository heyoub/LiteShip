/**
 * `Q.from(boundary).outputs({ ... })` builder API.
 * Creates {@link QuantizerConfig} with content-addressed identity, and
 * {@link LiveQuantizer} with reactive output streams.
 *
 * Wired: MotionTier-gated output routing, springToLinearCSS auto-generation,
 * content-address memoization via {@link MemoCache}.
 *
 * @module
 */

import type { Scope } from 'effect';
import { Effect, Stream, SubscriptionRef, Queue } from 'effect';
import type {
  Boundary,
  StateUnion,
  BoundaryCrossing,
  ContentAddress,
  Quantizer,
  OutputsFor,
  HLCBrand,
} from '@czap/core';
import type { MotionTier } from '@czap/core';
import {
  ContentAddress as mkContentAddress,
  StateName as mkStateName,
  TypedRef,
  Easing,
  fnv1aBytes,
} from '@czap/core';
import { evaluate } from './evaluate.js';
import type { EvaluateResult } from './evaluate.js';
import { MemoCache } from './memo-cache.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Typed accessor for the initial state of a boundary. Boundary.make guarantees
 * the states tuple is non-empty, so `states[0]` is always defined; this contains
 * the one unavoidable cast where a generic index access meets noUncheckedIndexedAccess.
 */
function firstState<B extends Boundary.Shape>(boundary: B): StateUnion<B> {
  return boundary.states[0] as StateUnion<B>;
}

// ---------------------------------------------------------------------------
// Output target literal type
// ---------------------------------------------------------------------------

/**
 * Compilation target for quantizer per-state outputs.
 *
 * `css` emits style declarations, `glsl`/`wgsl` emit shader uniforms,
 * `aria` emits accessibility attributes, `ai` emits model-facing signals.
 * MotionTier gates which targets a device is permitted to receive; see
 * {@link TIER_TARGETS}.
 */
export type OutputTarget = 'css' | 'glsl' | 'wgsl' | 'aria' | 'ai';

// ---------------------------------------------------------------------------
// MotionTier gating (canonical type from @czap/core)
// ---------------------------------------------------------------------------

export type { MotionTier } from '@czap/core';

/**
 * MotionTier → allowed {@link OutputTarget} set.
 *
 * Higher tiers include lower-tier targets. `none` only allows ARIA; `compute`
 * unlocks every target including WGSL and AI signal routing. `force()` can
 * override this gating per-target for prototype and test scenarios.
 */
export const TIER_TARGETS: Record<MotionTier, ReadonlySet<OutputTarget>> = {
  none: new Set(['aria']),
  transitions: new Set(['css', 'aria']),
  animations: new Set(['css', 'aria']),
  physics: new Set(['css', 'glsl', 'aria']),
  compute: new Set(['css', 'glsl', 'wgsl', 'aria', 'ai']),
};

// ---------------------------------------------------------------------------
// Quantizer outputs shape
// ---------------------------------------------------------------------------

/**
 * Per-target output tables keyed by boundary state.
 *
 * Each optional field is a record mapping every state in `B` to a target-
 * specific value shape: CSS allows `string | number`, GLSL/WGSL are numeric
 * only, ARIA is string only, AI is unconstrained. Missing fields simply
 * skip that target during dispatch.
 */
export interface QuantizerOutputs<B extends Boundary.Shape> {
  /** CSS property map per state (values are raw CSS, e.g. `'16px'` or `1`). */
  readonly css?: OutputsFor<B, Record<string, string | number>>;
  /** GLSL uniform values per state (numeric only). */
  readonly glsl?: OutputsFor<B, Record<string, number>>;
  /** WGSL uniform values per state (numeric only). */
  readonly wgsl?: OutputsFor<B, Record<string, number>>;
  /** ARIA attribute map per state (string values only). */
  readonly aria?: OutputsFor<B, Record<string, string>>;
  /** AI-facing signals per state (free-form; consumed by LLMAdapter). */
  readonly ai?: OutputsFor<B, Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Spring config for CSS auto-generation
// ---------------------------------------------------------------------------

/**
 * Spring physics parameters for CSS easing auto-generation.
 *
 * When a {@link QuantizerConfig} carries a spring, its CSS outputs receive an
 * injected `--czap-easing` custom property derived via `Easing.springToLinearCSS`
 * so native `linear()` timing matches the physical spring response.
 */
export interface SpringConfig {
  /** Spring constant (force per unit displacement); higher = snappier. */
  readonly stiffness: number;
  /** Damping coefficient; higher = less oscillation. */
  readonly damping: number;
  /** Mass of the animated body; defaults to `1`. */
  readonly mass?: number;
}

// ---------------------------------------------------------------------------
// Builder options
// ---------------------------------------------------------------------------

/**
 * Options accepted by {@link Q.from}.
 *
 * `tier` gates which output targets get produced (see {@link TIER_TARGETS}).
 * `spring` enables automatic CSS `--czap-easing` injection on CSS outputs.
 */
export interface QuantizerFromOptions {
  /** MotionTier for output gating; omit to allow all targets. */
  readonly tier?: MotionTier;
  /** Spring config that drives CSS easing generation for CSS outputs. */
  readonly spring?: SpringConfig;
}

// ---------------------------------------------------------------------------
// Quantizer config (immutable, content-addressed)
// ---------------------------------------------------------------------------

/**
 * Immutable, content-addressed quantizer definition.
 *
 * The `id` is an FNV-1a hash over the boundary id and outputs, so two
 * configs with identical definitions share the same address and are
 * deduplicated by the internal memo cache. `create()` materializes a
 * fresh {@link LiveQuantizer} within an Effect scope.
 */
export interface QuantizerConfig<B extends Boundary.Shape, O extends QuantizerOutputs<B> = QuantizerOutputs<B>> {
  /** Boundary this config quantizes against. */
  readonly boundary: B;
  /** Per-target output tables keyed by state. */
  readonly outputs: O;
  /** Content-addressed identity (FNV-1a of boundary id + outputs). */
  readonly id: ContentAddress;
  /** Motion tier gating active targets; see {@link TIER_TARGETS}. */
  readonly tier?: MotionTier;
  /** Spring config driving CSS easing injection. */
  readonly spring?: SpringConfig;
  /** Instantiate a reactive {@link LiveQuantizer} scoped to an Effect fiber. */
  create(): Effect.Effect<LiveQuantizer<B, O>, never, Scope.Scope>;
}

// ---------------------------------------------------------------------------
// Live quantizer (extends base Quantizer with output dispatch)
// ---------------------------------------------------------------------------

/**
 * Runtime-instantiated quantizer with reactive output dispatch.
 *
 * Extends the core {@link Quantizer} with a reactive outputs table: as
 * boundary crossings are detected, `currentOutputs` updates and
 * `outputChanges` streams the new per-target record. Consumers typically
 * subscribe via `Stream.runForEach(liveQuantizer.outputChanges, …)`.
 *
 * @example
 * ```ts
 * import { Boundary } from '@czap/core';
 * import { Q } from '@czap/quantizer';
 * import { Effect, Stream } from 'effect';
 *
 * const b = Boundary.make({
 *   input: 'w', states: ['sm', 'lg'] as const, thresholds: [0, 768],
 * });
 * const config = Q.from(b).outputs({
 *   css: { sm: { fontSize: '14px' }, lg: { fontSize: '18px' } },
 * });
 * Effect.runSync(Effect.scoped(Effect.gen(function* () {
 *   const live = yield* config.create();
 *   live.evaluate(900); // triggers crossing; outputs stream emits CSS
 * })));
 * ```
 */
export interface LiveQuantizer<
  B extends Boundary.Shape,
  O extends QuantizerOutputs<B> = QuantizerOutputs<B>,
> extends Quantizer<B> {
  /** The config this quantizer was created from. */
  readonly config: QuantizerConfig<B, O>;
  /** Read the currently-active per-target output record. */
  readonly currentOutputs: Effect.Effect<Partial<{ [K in OutputTarget]: Record<string, unknown> }>>;
  /** Stream of per-target output records emitted on each boundary crossing. */
  readonly outputChanges: Stream.Stream<Partial<{ [K in OutputTarget]: Record<string, unknown> }>>;
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/**
 * Fluent builder returned by {@link Q.from}.
 *
 * Call `.outputs({ ... })` to produce a content-addressed
 * {@link QuantizerConfig}, optionally preceded by `.force(targets)` to
 * override MotionTier gating for specific targets (e.g., enabling AI
 * signals at the `none` tier for testing).
 */
export interface QuantizerBuilder<B extends Boundary.Shape> {
  /** Attach per-target output tables and produce a {@link QuantizerConfig}. */
  outputs<O extends QuantizerOutputs<B>>(outputs: O): QuantizerConfig<B, O>;
  /** Force-enable specific targets regardless of the current tier's gating set. */
  force(...targets: OutputTarget[]): QuantizerBuilder<B>;
}

type CachedQuantizerConfig = QuantizerConfig<Boundary.Shape, QuantizerOutputs<Boundary.Shape>>;

// ---------------------------------------------------------------------------
// Content-address via CBOR canonical encoding + FNV-1a hash (matches @czap/core)
// ---------------------------------------------------------------------------

function contentAddress<B extends Boundary.Shape, O extends QuantizerOutputs<B>>(
  boundary: B,
  outputs: O,
): ContentAddress {
  const payload = { boundaryId: boundary.id, outputs };
  return fnv1aBytes(TypedRef.canonicalize(payload));
}

// ---------------------------------------------------------------------------
// Memoization caches
// ---------------------------------------------------------------------------

const configCache = MemoCache.make<CachedQuantizerConfig>();
const outputCache = MemoCache.make<Partial<{ [K in OutputTarget]: Record<string, unknown> }>>();
const springCSSCache = new Map<string, string>();

// ---------------------------------------------------------------------------
// Resolve outputs for the current state, gated by tier
// ---------------------------------------------------------------------------

/**
 * Read `outputs[target][state]` through the target-agnostic shape
 * `Record<string, Record<string, unknown>>`. Each QuantizerOutputs target
 * has a different value type (CSS allows `string | number`, GLSL is
 * number-only, etc.), so indexing at the `OutputTarget` union level
 * produces a wide union that TS cannot collapse. This helper performs
 * the one bridging cast so callers stay type-clean.
 */
function readTargetState<B extends Boundary.Shape, O extends QuantizerOutputs<B>>(
  outputs: O,
  target: OutputTarget,
  state: StateUnion<B>,
): Record<string, unknown> | undefined {
  const table = outputs[target] as Record<string, Record<string, unknown>> | undefined;
  return table?.[state as string];
}

function resolveOutputs<B extends Boundary.Shape, O extends QuantizerOutputs<B>>(
  outputs: O,
  state: StateUnion<B>,
  allowedTargets: ReadonlySet<OutputTarget> | null,
  forcedTargets: ReadonlySet<OutputTarget> | null,
  configId: ContentAddress,
  springCSS: string | null,
): Partial<{ [K in OutputTarget]: Record<string, unknown> }> {
  // Check output cache
  const cacheKey = mkContentAddress(`${configId}:${state as string}:${springCSS ? '1' : '0'}`);
  const cached = outputCache.get(cacheKey);
  if (cached) return cached;

  const result: Partial<{ [K in OutputTarget]: Record<string, unknown> }> = {};
  const targets: OutputTarget[] = ['css', 'glsl', 'wgsl', 'aria', 'ai'];

  for (const target of targets) {
    // Check tier gating
    if (allowedTargets !== null && !allowedTargets.has(target)) {
      // Check force escape hatch
      if (forcedTargets === null || !forcedTargets.has(target)) {
        continue;
      }
    }

    const stateOutputs = readTargetState(outputs, target, state);
    if (stateOutputs !== undefined) {
      if (target === 'css' && springCSS) {
        // Inject the spring easing CSS custom property alongside CSS outputs
        result[target] = { ...stateOutputs, '--czap-easing': springCSS };
      } else {
        result[target] = stateOutputs;
      }
    }
  }

  outputCache.set(cacheKey, result);
  return result;
}

// ---------------------------------------------------------------------------
// Monotonic HLC for sync evaluate() -- uses Date.now() + incrementing counter
// ---------------------------------------------------------------------------

let hlcCounter = 0;

// ---------------------------------------------------------------------------
// Spring CSS computation with caching
// ---------------------------------------------------------------------------

function getSpringCSS(spring: SpringConfig): string {
  const key = `${spring.stiffness}:${spring.damping}:${spring.mass ?? 1}`;
  let css = springCSSCache.get(key);
  if (!css) {
    css = Easing.springToLinearCSS(spring);
    springCSSCache.set(key, css);
  }
  return css;
}

// ---------------------------------------------------------------------------
// Q.from(boundary) builder factory
// ---------------------------------------------------------------------------

/**
 * Create a quantizer builder from a boundary definition.
 *
 * Starts a fluent chain: `Q.from(boundary).outputs({...})` produces a
 * content-addressed `QuantizerConfig` whose `.create()` method yields a
 * reactive `LiveQuantizer` inside an Effect scope.
 *
 * @example
 * ```ts
 * import { Boundary } from '@czap/core';
 * import { Q } from '@czap/quantizer';
 * import { Effect } from 'effect';
 *
 * const boundary = Boundary.make({
 *   input: 'width', states: ['sm', 'md', 'lg'] as const,
 *   thresholds: [0, 640, 1024],
 * });
 * const config = Q.from(boundary).outputs({
 *   css: { sm: { fontSize: '14px' }, md: { fontSize: '16px' }, lg: { fontSize: '18px' } },
 * });
 * const state = Effect.scoped(
 *   Effect.gen(function* () {
 *     const live = yield* config.create();
 *     return live.evaluate(800); // 'md'
 *   }),
 * );
 * const result = Effect.runSync(state);
 * ```
 *
 * @param boundary - The boundary definition to quantize against
 * @param options  - Optional motion tier and spring configuration
 * @returns A {@link QuantizerBuilder} for chaining `.outputs()` and `.force()`
 */
function fromBoundary<B extends Boundary.Shape>(boundary: B, options?: QuantizerFromOptions): QuantizerBuilder<B> {
  const tier = options?.tier;
  const spring = options?.spring;
  const allowedTargets = tier ? (TIER_TARGETS[tier] ?? null) : null;
  let forcedTargets: Set<OutputTarget> | null = null;

  const builder: QuantizerBuilder<B> = {
    outputs<O extends QuantizerOutputs<B>>(outputs: O): QuantizerConfig<B, O> {
      const id = contentAddress(boundary, outputs);

      // Check config cache
      const cachedConfig = configCache.get(id);
      if (cachedConfig) return cachedConfig as QuantizerConfig<B, O>;

      // Compute spring CSS if spring config present and CSS outputs exist
      const springCSS = spring && outputs.css ? getSpringCSS(spring) : null;

      const frozenForced = forcedTargets;

      const config: QuantizerConfig<B, O> = {
        boundary,
        outputs,
        id,
        tier,
        spring,
        create(): Effect.Effect<LiveQuantizer<B, O>, never, Scope.Scope> {
          return Effect.gen(function* () {
            // Boundary.make guarantees non-empty states; head access widens to StateUnion<B>.
            const initialState: StateUnion<B> = firstState(boundary);
            const initialOutputs = resolveOutputs(outputs, initialState, allowedTargets, frozenForced, id, springCSS);

            const stateRef = yield* SubscriptionRef.make(initialState);
            const outputRef = yield* SubscriptionRef.make(initialOutputs);

            const crossingQueue = yield* Queue.unbounded<BoundaryCrossing<StateUnion<B> & string>>();

            let previousState: StateUnion<B> = initialState;
            const crossingStream: Stream.Stream<BoundaryCrossing<StateUnion<B> & string>> =
              Stream.fromQueue(crossingQueue);

            const liveQuantizer: LiveQuantizer<B, O> = {
              _tag: 'Quantizer',
              boundary,
              config,
              state: SubscriptionRef.get(stateRef),
              stateSync: () => previousState,
              changes: crossingStream,

              evaluate(value: number): StateUnion<B> {
                const result: EvaluateResult<StateUnion<B> & string> = evaluate(boundary, value, previousState);

                if (result.crossed) {
                  const crossing: BoundaryCrossing<StateUnion<B> & string> = {
                    from: mkStateName<StateUnion<B> & string>(previousState),
                    to: mkStateName(result.state),
                    timestamp: { wall_ms: Date.now(), counter: hlcCounter++, node_id: 'quantizer' } satisfies HLCBrand,
                    value,
                  };
                  previousState = result.state;

                  const newOutputs = resolveOutputs(outputs, result.state, allowedTargets, frozenForced, id, springCSS);
                  Effect.runSync(
                    Effect.all([
                      SubscriptionRef.set(stateRef, result.state),
                      SubscriptionRef.set(outputRef, newOutputs),
                    ]),
                  );
                  Queue.offerUnsafe(crossingQueue, crossing);
                }

                return result.state;
              },

              currentOutputs: SubscriptionRef.get(outputRef),
              outputChanges: SubscriptionRef.changes(outputRef),
            };

            return liveQuantizer;
          });
        },
      };

      configCache.set(id, config);
      forcedTargets = null;
      return config;
    },

    force(...targets: OutputTarget[]): QuantizerBuilder<B> {
      forcedTargets = new Set(targets);
      return builder;
    },
  };

  return builder;
}

/**
 * Quantizer builder namespace.
 *
 * `Q.from(boundary)` starts a fluent builder that produces a content-addressed
 * {@link QuantizerConfig}. Calling `config.create()` within an Effect scope
 * yields a reactive {@link LiveQuantizer} that evaluates numeric input values
 * against boundary thresholds, dispatches state transitions, and routes
 * per-state outputs (CSS, GLSL, WGSL, ARIA, AI) gated by MotionTier.
 *
 * @example
 * ```ts
 * import { Boundary } from '@czap/core';
 * import { Q } from '@czap/quantizer';
 * import { Effect } from 'effect';
 *
 * const boundary = Boundary.make({
 *   input: 'width', states: ['sm', 'lg'] as const,
 *   thresholds: [0, 768],
 * });
 * const config = Q.from(boundary).outputs({
 *   css: { sm: { display: 'block' }, lg: { display: 'grid' } },
 * });
 * const result = Effect.runSync(Effect.scoped(
 *   Effect.gen(function* () {
 *     const live = yield* config.create();
 *     live.evaluate(1024);
 *     return yield* live.currentOutputs;
 *   }),
 * ));
 * // result.css => { display: 'grid' }
 * ```
 */
export const Q = {
  from: fromBoundary,
} as const;
