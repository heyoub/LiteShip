/**
 * AnimatedQuantizer -- wraps a Quantizer with Transitions.
 * On boundary crossing, interpolates between old and new output values
 * over the configured transition duration/easing.
 */

import type { Scope } from 'effect';
import { Effect, Stream, SubscriptionRef, Queue, Fiber, Ref, Duration } from 'effect';
import type { Boundary, StateUnion, BoundaryCrossing, Quantizer, Easing } from '@czap/core';
import type { Transition, TransitionMap } from './transition.js';
import { Transition as TransitionFactory } from './transition.js';

// ---------------------------------------------------------------------------
// Animated quantizer interface
// ---------------------------------------------------------------------------

/**
 * Quantizer augmented with transition-aware output interpolation.
 *
 * The `interpolated` stream emits a frame on each animation tick containing
 * the target state, normalized progress (0-1), and the current lerped
 * output record. Non-numeric values snap at the 50% mark.
 */
export interface AnimatedQuantizerShape<B extends Boundary.Shape> extends Quantizer<B> {
  /** Resolver that maps `from -> to` crossings to {@link TransitionConfig}. */
  readonly transition: Transition<B>;
  /** Stream of interpolated animation frames during crossings. */
  readonly interpolated: Stream.Stream<{
    /** Target state of the in-flight transition. */
    readonly state: StateUnion<B>;
    /** Progress in `[0, 1]`, where `1` means the animation has landed. */
    readonly progress: number;
    /** Interpolated output record for the current frame. */
    readonly outputs: Record<string, number | string>;
  }>;
}

// ---------------------------------------------------------------------------
// Linear easing fallback
// ---------------------------------------------------------------------------

const linearEasing: Easing.Fn = (t: number) => t;

// ---------------------------------------------------------------------------
// Interpolate numeric values between two output records
// ---------------------------------------------------------------------------

function lerpOutputs(
  from: Record<string, number | string>,
  to: Record<string, number | string>,
  t: number,
): Record<string, number | string> {
  const result: Record<string, number | string> = {};
  const allKeys = new Set([...Object.keys(from), ...Object.keys(to)]);
  for (const key of allKeys) {
    const a = from[key];
    const b = to[key];
    if (typeof a === 'number' && typeof b === 'number') {
      result[key] = a + (b - a) * t;
    } else {
      // Non-numeric values snap to target at progress >= 0.5
      result[key] = (t < 0.5 ? (a ?? b) : (b ?? a)) as number | string;
    }
  }
  return result;
}

function nowMs(): number {
  // performance.now() is standard in browsers and Node ≥ 16.
  // Optional chaining guards against stripped worker/SSR environments.
  if (typeof globalThis.performance?.now === 'function') {
    return globalThis.performance.now();
  }
  return Date.now();
}

// ---------------------------------------------------------------------------
// Factory (internal impl)
// ---------------------------------------------------------------------------

/**
 * Create an animated quantizer that interpolates outputs during transitions.
 *
 * Wraps an existing {@link Quantizer} and applies easing/duration-based
 * interpolation between old and new output values when a boundary crossing
 * occurs. Produces an `interpolated` stream of frames with progress and
 * lerped numeric outputs at ~60fps.
 *
 * @example
 * ```ts
 * import { Boundary } from '@czap/core';
 * import { Q, AnimatedQuantizer } from '@czap/quantizer';
 * import { Effect, Stream } from 'effect';
 *
 * const boundary = Boundary.make({
 *   input: 'scroll', states: ['top', 'bottom'] as const,
 *   thresholds: [0, 500],
 * });
 * const config = Q.from(boundary).outputs({
 *   css: { top: { opacity: '1' }, bottom: { opacity: '0.5' } },
 * });
 * const program = Effect.scoped(Effect.gen(function* () {
 *   const live = yield* config.create();
 *   const animated = yield* AnimatedQuantizer.make(
 *     live,
 *     { '*->*': { duration: 300 } },
 *     { top: { opacity: 1 }, bottom: { opacity: 0.5 } },
 *   );
 *   live.evaluate(600); // triggers interpolation
 *   return animated;
 * }));
 * ```
 *
 * @param quantizer   - The base quantizer to wrap
 * @param transitions - Map of state transition configs keyed by `from->to` pattern
 * @param outputs     - Per-state numeric output maps for interpolation
 * @returns An Effect yielding an {@link AnimatedQuantizerShape} (scoped)
 */
function makeAnimatedQuantizer<B extends Boundary.Shape>(
  quantizer: Quantizer<B>,
  transitions: TransitionMap<StateUnion<B> & string>,
  outputs?: Record<string, Record<string, number | string>>,
): Effect.Effect<AnimatedQuantizerShape<B>, never, Scope.Scope> {
  return Effect.gen(function* () {
    const boundary = quantizer.boundary;
    const transitionResolver = TransitionFactory.for(quantizer, transitions);

    const initialState: StateUnion<B> = yield* quantizer.state;
    const stateRef = yield* SubscriptionRef.make<StateUnion<B>>(initialState);

    type InterpolatedFrame = {
      readonly state: StateUnion<B>;
      readonly progress: number;
      readonly outputs: Record<string, number | string>;
    };

    const currentOutputsRef = yield* Ref.make<Record<string, number | string>>(outputs?.[initialState as string] ?? {});
    const currentFiberRef = yield* Ref.make<Fiber.Fiber<void> | null>(null);

    const interpolatedStream: Stream.Stream<InterpolatedFrame> = Stream.callback<InterpolatedFrame>((queue) =>
      Effect.gen(function* () {
        yield* Effect.addFinalizer(() =>
          Effect.gen(function* () {
            const currentFiber = yield* Ref.get(currentFiberRef);
            if (currentFiber !== null) {
              yield* Fiber.interrupt(currentFiber);
            }
          }),
        );

        yield* Stream.runForEach(quantizer.changes, (crossing: BoundaryCrossing<StateUnion<B> & string>) =>
          Effect.gen(function* () {
            const existingFiber = yield* Ref.get(currentFiberRef);
            if (existingFiber !== null) {
              yield* Fiber.interrupt(existingFiber);
            }

            // crossing.from/to are StateName<StateUnion<B> & string>, which is a branded
            // subtype of StateUnion<B>; assignable directly without a cast.
            const { from, to } = crossing;
            const config = transitionResolver.getTransition(from, to);
            const duration = config.duration;
            const easing = config.easing ?? linearEasing;
            const delay = config.delay ?? 0;

            const fromOutputs = { ...(yield* Ref.get(currentOutputsRef)) };
            const toOutputs: Record<string, number | string> = outputs?.[crossing.to as string] ?? {};

            const animationLoop = Effect.gen(function* () {
              if (delay > 0) {
                yield* Effect.sleep(Duration.millis(delay));
              }

              if (duration <= 0) {
                Queue.offerUnsafe(queue, { state: to, progress: 1, outputs: toOutputs });
                yield* Ref.set(currentOutputsRef, toOutputs);
                yield* SubscriptionRef.set(stateRef, to);
                return;
              }

              // Time-sliced animation loop (~60fps via 16ms sleep)
              const startTime = nowMs();
              let progress = 0;
              while (progress < 1) {
                const elapsed = nowMs() - startTime;
                progress = Math.min(elapsed / duration, 1);
                const eased = easing(progress);
                const interpolated = lerpOutputs(fromOutputs, toOutputs, eased);
                yield* Ref.set(currentOutputsRef, interpolated);
                Queue.offerUnsafe(queue, { state: to, progress, outputs: interpolated });

                if (progress < 1) {
                  yield* Effect.sleep(Duration.millis(16));
                }
              }

              yield* Ref.set(currentOutputsRef, toOutputs);
              yield* SubscriptionRef.set(stateRef, to);
            });

            const fiber = yield* Effect.forkChild(animationLoop);
            yield* Ref.set(currentFiberRef, fiber);
          }),
        );

        const finalFiber = yield* Ref.get(currentFiberRef);
        const fibers = [finalFiber].filter((fiber): fiber is Fiber.Fiber<void> => fiber !== null);
        yield* Effect.forEach(fibers, Fiber.join, { discard: true });
        yield* Ref.set(currentFiberRef, null);
      }),
    );

    const animatedQuantizer: AnimatedQuantizerShape<B> = {
      _tag: 'Quantizer',
      boundary,
      transition: transitionResolver,
      state: SubscriptionRef.get(stateRef),
      stateSync: quantizer.stateSync ? () => quantizer.stateSync!() : undefined,
      changes: quantizer.changes,
      evaluate(value: number): StateUnion<B> {
        return quantizer.evaluate(value);
      },
      interpolated: interpolatedStream,
    };

    return animatedQuantizer;
  });
}

// ---------------------------------------------------------------------------
// AnimatedQuantizer module object
// ---------------------------------------------------------------------------

/**
 * Animated quantizer namespace.
 *
 * Wraps a base quantizer with transition-aware interpolation. When a boundary
 * crossing occurs, numeric output values are lerped over a configurable
 * duration and easing curve. Non-numeric values snap at the 50% mark.
 * The `interpolated` stream emits frames containing progress (0-1) and
 * the current interpolated output record.
 *
 * @example
 * ```ts
 * import { Boundary } from '@czap/core';
 * import { Q, AnimatedQuantizer } from '@czap/quantizer';
 * import { Effect } from 'effect';
 *
 * const boundary = Boundary.make({
 *   input: 'scroll', states: ['top', 'bottom'] as const,
 *   thresholds: [0, 500],
 * });
 * const config = Q.from(boundary).outputs({});
 * const program = Effect.scoped(Effect.gen(function* () {
 *   const live = yield* config.create();
 *   const animated = yield* AnimatedQuantizer.make(
 *     live,
 *     { '*->*': { duration: 200 } },
 *   );
 *   return animated.transition; // TransitionResolver
 * }));
 * ```
 */
export const AnimatedQuantizer = {
  /** Wrap a quantizer with transition-aware output interpolation. */
  make: makeAnimatedQuantizer,
} as const;

export declare namespace AnimatedQuantizer {
  /** Shape of an animated quantizer parameterized by boundary `B`. */
  export type Shape<B extends Boundary.Shape> = AnimatedQuantizerShape<B>;
}
