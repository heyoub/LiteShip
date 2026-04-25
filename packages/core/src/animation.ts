/**
 * Animation -- rAF to Effect.Stream interpolation + value lerping.
 *
 * Produces a Stream of AnimationFrame values driven by requestAnimationFrame,
 * with configurable duration and easing. Also provides numeric record
 * interpolation for smooth state transitions.
 *
 * @module
 */

import { Effect, Stream, Queue } from 'effect';
import type { Millis } from './brands.js';
import { Millis as mkMillis } from './brands.js';
import type { Easing } from './easing.js';
import { Easing as EasingImpl } from './easing.js';
import type { Scheduler } from './scheduler.js';
import { Scheduler as SchedulerImpl } from './scheduler.js';
import { interpolate } from './interpolate.js';

interface AnimationFrameShape {
  readonly progress: number;
  readonly eased: number;
  readonly elapsed: Millis;
  readonly timestamp: number;
}

/**
 * Create a finite animation stream driven by rAF.
 * Emits AnimationFrame values from progress 0 to 1.
 */
function _run(config: {
  duration: Millis;
  easing?: Easing.Fn;
  scheduler?: Scheduler.Shape;
}): Stream.Stream<AnimationFrameShape> {
  const { duration, easing = EasingImpl.linear } = config;

  if (duration <= 0) {
    return Stream.succeed<AnimationFrameShape>({
      progress: 1,
      eased: easing(1),
      elapsed: mkMillis(0),
      timestamp: 0,
    });
  }

  return Stream.callback<AnimationFrameShape>((queue) =>
    Effect.gen(function* () {
      const sched =
        config.scheduler ?? (typeof requestAnimationFrame !== 'undefined' ? SchedulerImpl.raf() : SchedulerImpl.noop());

      let startTime: number | null = null;
      let schedId: number;

      const tick = (timestamp: number): void => {
        if (startTime === null) startTime = timestamp;
        const elapsed = timestamp - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = easing(progress);

        Queue.offerUnsafe(queue, {
          progress,
          eased,
          elapsed: mkMillis(elapsed),
          timestamp,
        });

        if (progress >= 1) {
          Queue.endUnsafe(queue);
        } else {
          schedId = sched.schedule(tick);
        }
      };

      schedId = sched.schedule(tick);

      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          sched.cancel(schedId);
        }),
      );

      yield* Effect.never;
    }),
  );
}

/**
 * Animation — rAF-driven value interpolation exposed as an `Effect.Stream`.
 * Pairs a duration and easing with either primitive lerping or the generic
 * {@link Animation.interpolate} over numeric records.
 */
export const Animation = {
  /** Run an rAF animation that yields a stream of {@link Animation.Frame}. */
  run: _run,
  /** Shallow numeric-record interpolator; non-numeric keys pass through. */
  interpolate,
};

export declare namespace Animation {
  /** Structural shape of a single frame emitted by {@link Animation.run}. */
  export type Frame = AnimationFrameShape;
}
