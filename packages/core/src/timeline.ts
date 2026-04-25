/**
 * Timeline -- quantizer over time with play/pause/seek/scrub/reverse.
 *
 * A Timeline wraps a BoundaryDef and drives it from a time-based signal,
 * producing discrete state transitions as the elapsed time crosses thresholds.
 *
 * @module
 */

import type { Stream, Scope } from 'effect';
import { Effect, SubscriptionRef, Ref } from 'effect';
import type { Millis } from './brands.js';
import { Millis as mkMillis } from './brands.js';
import { Boundary } from './boundary.js';
import type { StateUnion } from './type-utils.js';
import type { Scheduler } from './scheduler.js';
import { Scheduler as SchedulerImpl } from './scheduler.js';

interface TimelineShape<B extends Boundary.Shape = Boundary.Shape> {
  readonly boundary: B;
  readonly state: Effect.Effect<StateUnion<B>>;
  readonly progress: Effect.Effect<number>;
  readonly elapsed: Effect.Effect<Millis>;
  readonly changes: Stream.Stream<StateUnion<B>>;
  play(): Effect.Effect<void>;
  pause(): Effect.Effect<void>;
  reverse(): Effect.Effect<void>;
  seek(ms: Millis): Effect.Effect<void>;
  scrub(progress: number): Effect.Effect<void>;
}

interface TimelineFactory {
  from<B extends Boundary.Shape>(
    boundary: B,
    config?: { duration?: Millis; loop?: boolean; scheduler?: Scheduler.Shape },
  ): Effect.Effect<TimelineShape<B>, never, Scope.Scope>;
}

/**
 * Timeline — scheduler-driven advancement over a {@link Boundary}.
 * Produces a scoped reactive timeline that seeks or plays between boundary
 * states; pluggable clock via {@link Scheduler}.
 */
export const Timeline: TimelineFactory = {
  from<B extends Boundary.Shape>(
    boundary: B,
    config?: { duration?: Millis; loop?: boolean; scheduler?: Scheduler.Shape },
  ): Effect.Effect<TimelineShape<B>, never, Scope.Scope> {
    const duration =
      config?.duration ??
      (boundary.thresholds.length > 0 ? boundary.thresholds[boundary.thresholds.length - 1]! * 1.2 : 1000);
    const loop = config?.loop ?? false;

    return Effect.gen(function* () {
      const elapsedRef = yield* SubscriptionRef.make(0);
      const playingRef = yield* Ref.make(false);
      const directionRef = yield* Ref.make<1 | -1>(1);
      const initialState: StateUnion<B> = Boundary.evaluate(boundary, 0);
      const stateRef = yield* SubscriptionRef.make<StateUnion<B>>(initialState);

      const sched =
        config?.scheduler ??
        (typeof requestAnimationFrame !== 'undefined' ? SchedulerImpl.raf() : SchedulerImpl.noop());

      let lastTime: number | null = null;
      let playing = false;
      let direction: 1 | -1 = 1;
      let currentElapsed = 0;

      const step = (now: number): void => {
        if (lastTime !== null && playing) {
          const dt = (now - lastTime) * direction;
          let next = currentElapsed + dt;
          if (loop) {
            next = ((next % duration) + duration) % duration;
          } else {
            next = Math.max(0, Math.min(duration, next));
          }
          currentElapsed = next;
          Effect.runSync(SubscriptionRef.set(elapsedRef, next));
          const newState: StateUnion<B> = Boundary.evaluate(boundary, next);
          const oldState = Effect.runSync(SubscriptionRef.get(stateRef));
          if (newState !== oldState) {
            Effect.runSync(SubscriptionRef.set(stateRef, newState));
          }
        }
        lastTime = now;
        schedId = sched.schedule(step);
      };
      let schedId = sched.schedule(step);
      yield* Effect.addFinalizer(() => Effect.sync(() => sched.cancel(schedId)));

      const timeline: TimelineShape<B> = {
        boundary,
        state: SubscriptionRef.get(stateRef),
        progress: Effect.map(SubscriptionRef.get(elapsedRef), (e) => Math.max(0, Math.min(e / duration, 1))),
        elapsed: Effect.map(SubscriptionRef.get(elapsedRef), (e) => mkMillis(e)),
        changes: SubscriptionRef.changes(stateRef),
        play: () =>
          Effect.gen(function* () {
            playing = true;
            yield* Ref.set(playingRef, true);
          }),
        pause: () =>
          Effect.gen(function* () {
            playing = false;
            yield* Ref.set(playingRef, false);
          }),
        reverse: () =>
          Effect.gen(function* () {
            direction = direction === 1 ? -1 : 1;
            yield* Ref.update(directionRef, (d) => (d === 1 ? -1 : 1));
          }),
        seek: (ms: number) =>
          Effect.gen(function* () {
            const clamped = Math.max(0, Math.min(duration, ms));
            currentElapsed = clamped;
            yield* SubscriptionRef.set(elapsedRef, clamped);
            const newState: StateUnion<B> = Boundary.evaluate(boundary, clamped);
            const oldState = yield* SubscriptionRef.get(stateRef);
            if (newState !== oldState) {
              yield* SubscriptionRef.set(stateRef, newState);
            }
          }),
        scrub: (progress: number) =>
          Effect.gen(function* () {
            const val = Math.max(0, Math.min(1, progress)) * duration;
            currentElapsed = val;
            yield* SubscriptionRef.set(elapsedRef, val);
            const newState: StateUnion<B> = Boundary.evaluate(boundary, val);
            const oldState = yield* SubscriptionRef.get(stateRef);
            if (newState !== oldState) {
              yield* SubscriptionRef.set(stateRef, newState);
            }
          }),
      };

      return timeline;
    });
  },
};

export declare namespace Timeline {
  /** Structural shape of a timeline instance for a given {@link Boundary}. */
  export type Shape<B extends Boundary.Shape = Boundary.Shape> = TimelineShape<B>;
}
