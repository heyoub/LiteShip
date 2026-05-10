/**
 * BoundaryDef -- the core primitive of constraint-based adaptive rendering.
 *
 * A boundary defines quantization: how a continuous signal value maps
 * to a discrete set of named states. Content-addressed via FNV-1a.
 *
 * @module
 */

import type { SignalInput, ThresholdValue, ContentAddress } from './brands.js';
import { SignalInput as mkSignalInput, ThresholdValue as mkThresholdValue } from './brands.js';
import { CanonicalCbor } from './cbor.js';
import { fnv1aBytes } from './fnv.js';
import { CzapValidationError } from './validation-error.js';

/** The core primitive. Source of truth for quantization boundaries. */
interface BoundaryDef<
  I extends string = string,
  S extends readonly [string, ...string[]] = readonly [string, ...string[]],
> {
  readonly _tag: 'BoundaryDef';
  readonly _version: 1;
  readonly id: ContentAddress;
  readonly input: SignalInput<I>;
  readonly thresholds: readonly ThresholdValue[];
  readonly states: S;
  readonly hysteresis?: number;
  readonly spec?: BoundarySpec;
}

interface BoundaryFactory {
  make<I extends string, const S extends readonly [string, ...string[]]>(config: {
    readonly input: I;
    readonly at: { readonly [K in keyof S]: readonly [number, S[K]] };
    readonly hysteresis?: number;
    readonly spec?: BoundarySpec;
  }): BoundaryDef<I, S>;
}

/**
 * Compute the content address for a boundary synchronously.
 * FNV-1a hash of the RFC 8949 §4.2.1 canonical CBOR encoding (ADR-0003).
 * Cross-machine stable: identical definitions produce byte-identical IDs.
 */
function deterministicId(
  input: string,
  thresholds: readonly number[],
  states: readonly string[],
  hysteresis?: number,
  spec?: BoundarySpec,
): ContentAddress {
  return fnv1aBytes(
    CanonicalCbor.encode({
      _tag: 'BoundaryDef',
      _version: 1,
      input,
      thresholds,
      states,
      hysteresis: hysteresis ?? null,
      spec: spec ?? null,
    }),
  );
}

/**
 * Evaluate which state a value falls into given a boundary (binary search).
 *
 * Uses binary search to find the rightmost threshold `<= value`, returning
 * the corresponding state name.
 *
 * @example
 * ```ts
 * const bp = Boundary.make({ input: 'viewport.width', at: [[0, 'sm'], [768, 'md'], [1024, 'lg']] });
 * const state = Boundary.evaluate(bp, 800);
 * // state === 'md'
 * ```
 */
function _evaluate<B extends BoundaryDef>(boundary: B, value: number): B['states'][number] {
  const { thresholds, states } = boundary;
  const len = thresholds.length;

  // Fast path: unrolled if-chain for small threshold arrays (≤4).
  // Avoids loop overhead and branch prediction misses of binary search.
  // Check from highest threshold downward; first match wins.
  if (len <= 4) {
    if (len === 1) {
      return states[0]!;
    }
    if (len === 2) {
      if (value >= (thresholds[1] as number)) return states[1]!;
      return states[0]!;
    }
    if (len === 3) {
      if (value >= (thresholds[2] as number)) return states[2]!;
      if (value >= (thresholds[1] as number)) return states[1]!;
      return states[0]!;
    }
    // len === 4
    if (value >= (thresholds[3] as number)) return states[3]!;
    if (value >= (thresholds[2] as number)) return states[2]!;
    if (value >= (thresholds[1] as number)) return states[1]!;
    return states[0]!;
  }

  // Binary search: find the rightmost threshold <= value
  let lo = 0;
  let hi = len;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((thresholds[mid] as number) <= value) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  // lo is the first threshold > value, so lo-1 is the match (or 0 if none)
  return states[lo > 0 ? lo - 1 : 0]!;
}

/**
 * Evaluate with hysteresis (requires previous state). Half-width dead zone algorithm.
 *
 * Prevents flickering at boundary edges by requiring the value to cross
 * beyond a dead zone (half the hysteresis width) before transitioning states.
 *
 * @example
 * ```ts
 * const bp = Boundary.make({ input: 'viewport.width', at: [[0, 'sm'], [768, 'md']], hysteresis: 20 });
 * const state1 = Boundary.evaluateWithHysteresis(bp, 770, 'sm');
 * // state1 === 'sm' (within dead zone, stays at previous)
 * const state2 = Boundary.evaluateWithHysteresis(bp, 780, 'sm');
 * // state2 === 'md' (past dead zone, transitions)
 * ```
 */
function _evaluateWithHysteresis<B extends BoundaryDef>(
  boundary: B,
  value: number,
  previousState: B['states'][number],
): B['states'][number] {
  if (!boundary.hysteresis || boundary.hysteresis <= 0) return _evaluate(boundary, value);

  const half = boundary.hysteresis / 2;
  const { thresholds, states } = boundary;
  const prevIdx = (states as readonly string[]).indexOf(previousState as string);

  // Unknown previous state -- fall back to raw evaluation
  if (prevIdx === -1) return _evaluate(boundary, value);

  // Find raw state via linear scan (matching evaluate semantics)
  let rawIdx = 0;
  for (let i = thresholds.length - 1; i >= 0; i--) {
    if (value >= thresholds[i]!) {
      rawIdx = i;
      break;
    }
  }

  // No crossing needed
  if (rawIdx === prevIdx) return states[rawIdx]!;

  // Dead-zone suppression: when crossing a threshold, require the value to exceed the
  // threshold by half the hysteresis width before committing. Prevents jitter when a
  // signal oscillates near a boundary.
  if (rawIdx > prevIdx) {
    for (let i = prevIdx + 1; i <= rawIdx; i++) {
      if (value < thresholds[i]! + half) {
        return states[i - 1]!;
      }
    }
  } else {
    for (let i = prevIdx; i > rawIdx; i--) {
      if (value > thresholds[i]! - half) {
        return states[i]!;
      }
    }
  }

  return states[rawIdx]!;
}

/**
 * Boundary namespace -- the core primitive of constraint-based adaptive rendering.
 *
 * Create boundaries that quantize continuous signal values into discrete named
 * states. Supports hysteresis for flicker-free transitions at threshold edges.
 *
 * @example
 * ```ts
 * import { Boundary } from '@czap/core';
 *
 * const bp = Boundary.make({
 *   input: 'viewport.width',
 *   at: [[0, 'mobile'], [768, 'tablet'], [1024, 'desktop']],
 *   hysteresis: 20,
 * });
 * const state = Boundary.evaluate(bp, 900);
 * // state === 'tablet'
 * const stableState = Boundary.evaluateWithHysteresis(bp, 770, 'mobile');
 * // stableState === 'mobile' (within dead zone)
 * ```
 */
/**
 * Check whether a boundary is active given its optional spec and current context.
 * Returns true if the boundary has no spec or the spec allows evaluation.
 */
function _isActive<B extends BoundaryDef>(
  boundary: B,
  context?: {
    capabilities?: Record<string, unknown>;
    nowMs?: number;
    activeExperiments?: ReadonlyArray<string>;
  },
): boolean {
  return _isSpecActive(boundary.spec, context);
}

/**
 * Boundary — core primitive of constraint-based adaptive rendering.
 *
 * A boundary quantizes a continuous signal (viewport, scroll, audio, …) into
 * a discrete set of named states. Every boundary is content-addressed via
 * FNV-1a, supports optional hysteresis to prevent flicker at thresholds, and
 * can be gated by a {@link BoundarySpec} for A/B or device-conditional activation.
 *
 * @example
 * ```ts
 * import { Boundary } from '@czap/core';
 *
 * const viewport = Boundary.make({
 *   input: 'viewport.width',
 *   at: [[0, 'mobile'], [640, 'tablet'], [1024, 'desktop']] as const,
 *   hysteresis: 16,
 * });
 * Boundary.evaluate(viewport, 800); // 'tablet'
 * ```
 */
export const Boundary: BoundaryFactory & {
  evaluate: typeof _evaluate;
  evaluateWithHysteresis: typeof _evaluateWithHysteresis;
  isActive: typeof _isActive;
} = {
  /**
   * Create a new `BoundaryDef` from a configuration object.
   *
   * Thresholds must be strictly ascending. The boundary is content-addressed
   * via FNV-1a hash of its definition.
   *
   * @example
   * ```ts
   * const bp = Boundary.make({
   *   input: 'viewport.width',
   *   at: [[0, 'sm'], [768, 'md'], [1024, 'lg']],
   *   hysteresis: 10,
   * });
   * // bp._tag === 'BoundaryDef'
   * // bp.id === 'fnv1a:...' (content address)
   * // bp.states === ['sm', 'md', 'lg']
   * ```
   */
  make<I extends string, const S extends readonly [string, ...string[]]>(config: {
    readonly input: I;
    readonly at: { readonly [K in keyof S]: readonly [number, S[K]] };
    readonly hysteresis?: number;
    readonly spec?: BoundarySpec;
  }): BoundaryDef<I, S> {
    const pairs = config.at;
    for (let i = 1; i < pairs.length; i++) {
      if (pairs[i]![0] <= pairs[i - 1]![0]) {
        throw new CzapValidationError(
          'Boundary.make',
          `thresholds must be strictly ascending. Got ${pairs[i - 1]![0]} before ${pairs[i]![0]} at index ${i}.`,
        );
      }
    }
    const stateNames = pairs.map(([, s]) => s);
    const seen = new Set<string>();
    for (const name of stateNames) {
      if (seen.has(name)) {
        throw new CzapValidationError(
          'Boundary.make',
          `duplicate state name "${name}". Each state must have a unique name.`,
        );
      }
      seen.add(name);
    }
    const thresholds = pairs.map(([t]) => mkThresholdValue(t));
    // tupleMap preserves arity but fn returns `string`, not per-element S[K]; one narrow cast is unavoidable.
    const states = pairs.map(([, s]) => s) as unknown as S;
    const id = deterministicId(config.input, thresholds, states, config.hysteresis, config.spec);

    return {
      _tag: 'BoundaryDef',
      _version: 1,
      id,
      input: mkSignalInput(config.input),
      thresholds,
      states,
      ...(config.hysteresis !== undefined ? { hysteresis: config.hysteresis } : {}),
      ...(config.spec !== undefined ? { spec: config.spec } : {}),
    };
  },
  evaluate: _evaluate,
  evaluateWithHysteresis: _evaluateWithHysteresis,
  isActive: _isActive,
};

/**
 * BoundarySpec: optional filter that gates whether a boundary is active.
 * Enables A/B testing, time-bounded experiments, and device targeting
 * without external wrapping logic.
 *
 * **Phase 2**: Spec evaluation is implemented and tested but not yet wired
 * into the Compositor evaluation loop. Call `BoundarySpec.isActive()` or
 * `Boundary.isActive()` manually to check activation in the interim.
 */
export interface BoundarySpec {
  /** Only evaluate this boundary when the device filter returns true. */
  readonly deviceFilter?: (capabilities: Record<string, unknown>) => boolean;
  /** Only evaluate this boundary within this time range (epoch ms). */
  readonly timeRange?: { readonly from?: number; readonly until?: number };
  /** Only evaluate this boundary for participants in this experiment. */
  readonly experimentId?: string;
}

/** Check if a BoundarySpec allows evaluation given current context. */
function _isSpecActive(
  spec: BoundarySpec | undefined,
  context?: {
    capabilities?: Record<string, unknown>;
    nowMs?: number;
    activeExperiments?: ReadonlyArray<string>;
  },
): boolean {
  if (!spec) return true;
  if (spec.deviceFilter && context?.capabilities) {
    if (!spec.deviceFilter(context.capabilities)) return false;
  }
  if (spec.timeRange) {
    const now = context?.nowMs ?? Date.now();
    if (spec.timeRange.from !== undefined && now < spec.timeRange.from) return false;
    if (spec.timeRange.until !== undefined && now > spec.timeRange.until) return false;
  }
  if (spec.experimentId && context?.activeExperiments) {
    if (!context.activeExperiments.includes(spec.experimentId)) return false;
  }
  return true;
}

/** BoundarySpec namespace — helpers for working with the optional activation filter on a boundary. */
export const BoundarySpec = {
  /** Check whether a {@link BoundarySpec} allows evaluation in the given context. */
  isActive: _isSpecActive,
};

export declare namespace Boundary {
  /** Structural shape of a boundary definition parameterized by input name `I` and state tuple `S`. */
  export type Shape<
    I extends string = string,
    S extends readonly [string, ...string[]] = readonly [string, ...string[]],
  > = BoundaryDef<I, S>;
  /** Alias for {@link BoundarySpec}. */
  export type Spec = BoundarySpec;
}
