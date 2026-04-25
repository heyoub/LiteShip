/**
 * @czap/quantizer type spine -- boundary detection, multi-target dispatch, animation.
 */

import type { Effect, Stream, Scope } from 'effect';
import type {
  Boundary,
  StateUnion,
  BoundaryCrossing,
  ContentAddress,
  Easing,
  Quantizer,
  OutputsFor,
} from './core.d.ts';

// ═══════════════════════════════════════════════════════════════════════════════
// § 1. QUANTIZER BUILDER (Q.from(boundary).outputs({...}))
// ═══════════════════════════════════════════════════════════════════════════════

export type OutputTarget = 'css' | 'glsl' | 'wgsl' | 'aria' | 'ai';

export type MotionTier = 'none' | 'transitions' | 'animations' | 'physics' | 'compute';

export interface SpringConfig {
  readonly stiffness: number;
  readonly damping: number;
  readonly mass?: number;
}

export interface QuantizerFromOptions {
  readonly tier?: MotionTier;
  readonly spring?: SpringConfig;
}

export declare const TIER_TARGETS: Record<MotionTier, ReadonlySet<OutputTarget>>;

export interface QuantizerOutputs<B extends Boundary.Shape> {
  readonly css?: OutputsFor<B, Record<string, string | number>>;
  readonly glsl?: OutputsFor<B, Record<string, number>>;
  readonly wgsl?: OutputsFor<B, Record<string, number>>;
  readonly aria?: OutputsFor<B, Record<string, string>>;
  readonly ai?: OutputsFor<B, Record<string, unknown>>;
}

export interface QuantizerBuilder<B extends Boundary.Shape> {
  outputs<O extends QuantizerOutputs<B>>(outputs: O): QuantizerConfig<B, O>;
}

export interface QuantizerConfig<B extends Boundary.Shape, O extends QuantizerOutputs<B> = QuantizerOutputs<B>> {
  readonly boundary: B;
  readonly outputs: O;
  readonly id: ContentAddress;
  create(): Effect.Effect<LiveQuantizer<B, O>, never, Scope.Scope>;
}

export interface LiveQuantizer<
  B extends Boundary.Shape,
  O extends QuantizerOutputs<B> = QuantizerOutputs<B>,
> extends Quantizer<B> {
  readonly config: QuantizerConfig<B, O>;
  readonly currentOutputs: Effect.Effect<Partial<{ [K in OutputTarget]: Record<string, unknown> }>>;
  readonly outputChanges: Stream.Stream<Partial<{ [K in OutputTarget]: Record<string, unknown> }>>;
}

export declare const Q: {
  from<B extends Boundary.Shape>(boundary: B): QuantizerBuilder<B>;
};

// ═══════════════════════════════════════════════════════════════════════════════
// § 2. EVALUATE (boundary detection + hysteresis)
// ═══════════════════════════════════════════════════════════════════════════════

export interface EvaluateResult<S extends string = string> {
  readonly state: S;
  readonly index: number;
  readonly value: number;
  readonly crossed: boolean;
}

export declare function evaluate<B extends Boundary.Shape>(
  boundary: B,
  value: number,
  previousState?: StateUnion<B>,
): EvaluateResult<StateUnion<B> & string>;

// ═══════════════════════════════════════════════════════════════════════════════
// § 3. TRANSITION
// ═══════════════════════════════════════════════════════════════════════════════

export interface TransitionConfig {
  readonly duration: number;
  readonly easing?: Easing.Fn;
  readonly delay?: number;
}

export interface TransitionMap<S extends string = string> {
  readonly '*'?: TransitionConfig;
  readonly [key: `${string}->${string}`]: TransitionConfig;
}

export interface Transition<B extends Boundary.Shape> {
  readonly config: TransitionMap<StateUnion<B> & string>;
  getTransition(from: StateUnion<B>, to: StateUnion<B>): TransitionConfig;
}

export declare const Transition: {
  for<B extends Boundary.Shape>(quantizer: Quantizer<B>, config: TransitionMap<StateUnion<B> & string>): Transition<B>;
};

// ═══════════════════════════════════════════════════════════════════════════════
// § 4. ANIMATED QUANTIZER
// ═══════════════════════════════════════════════════════════════════════════════

export interface AnimatedQuantizer<B extends Boundary.Shape> extends Quantizer<B> {
  readonly transition: Transition<B>;
  /** Stream of interpolated output values (not just discrete state changes) */
  readonly interpolated: Stream.Stream<{
    readonly state: StateUnion<B>;
    readonly progress: number;
    readonly outputs: Record<string, number | string>;
  }>;
}

export declare namespace AnimatedQuantizer {
  export function make<B extends Boundary.Shape>(
    quantizer: Quantizer<B>,
    transitions: TransitionMap<StateUnion<B> & string>,
  ): Effect.Effect<AnimatedQuantizer<B>, never, Scope.Scope>;
}
