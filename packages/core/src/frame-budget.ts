/**
 * FrameBudget -- rAF priority lanes for frame budget management.
 *
 * Tracks remaining frame budget per animation frame and
 * schedules work by priority: `critical > high > low > idle`.
 *
 * Hot path methods (remaining, canRun, scheduleSync) are plain JS.
 * Effect is used only for resource lifecycle (rAF cleanup) and
 * backwards-compatible schedule() wrapper.
 *
 * @module
 */

import type { Scope } from 'effect';
import { Effect } from 'effect';
import { DEFAULT_TARGET_FPS, MS_PER_SEC } from './defaults.js';

/**
 * Frame-budget priority lane in descending urgency. `critical` always runs;
 * `high` / `low` / `idle` gate based on the milliseconds remaining in the
 * current frame.
 */
export type Priority = 'critical' | 'high' | 'low' | 'idle';

// ms budget per priority lane within a 16ms frame (critical=0 runs first, high=2ms, low=6ms, idle=12ms)
const PRIORITY_THRESHOLDS: Record<Priority, number> = {
  critical: 0,
  high: 2,
  low: 6,
  idle: 12,
};

interface FrameBudgetShape {
  remaining(): number;
  canRun(priority: Priority): boolean;
  /** Synchronous scheduler for hot paths — no Effect overhead. */
  scheduleSync<A>(priority: Priority, task: () => A): A | null;
  schedule<A>(priority: Priority, task: Effect.Effect<A>): Effect.Effect<A | null>;
  readonly fps: Effect.Effect<number>;
  /** Synchronous FPS accessor for hot paths. */
  readonly fpsSync: number;
}

/**
 * Creates a FrameBudget tracker tied to rAF, with priority-based scheduling.
 * Critical tasks always run; lower priorities are deferred if budget is exhausted.
 *
 * @example
 * ```ts
 * const program = Effect.scoped(Effect.gen(function* () {
 *   const budget = yield* FrameBudget.make({ targetFps: 60 });
 *   const remaining = budget.remaining(); // ms left in this frame
 *   const canAnimate = budget.canRun('high'); // true if enough budget
 *   const result = yield* budget.schedule('low', Effect.succeed('done'));
 *   // result is 'done' if budget permits, null otherwise
 * }));
 * ```
 */
function _make(config?: { targetFps?: number }): Effect.Effect<FrameBudgetShape, never, Scope.Scope> {
  const targetFps = config?.targetFps ?? DEFAULT_TARGET_FPS;
  if (targetFps <= 0 || !Number.isFinite(targetFps)) {
    throw new RangeError(`FrameBudget.make: targetFps must be a positive finite number, got ${targetFps}`);
  }
  const frameBudgetMs = MS_PER_SEC / targetFps;

  return Effect.gen(function* () {
    let frameStart = typeof performance !== 'undefined' ? performance.now() : 0;
    let currentFps = targetFps;
    let lastFrameTime = typeof performance !== 'undefined' ? performance.now() : 0;
    let frameCount = 0;
    let fpsAccum = 0;

    if (typeof requestAnimationFrame !== 'undefined') {
      const tick = (now: number) => {
        frameStart = now;
        frameCount++;
        fpsAccum += now - lastFrameTime;
        lastFrameTime = now;
        if (fpsAccum >= MS_PER_SEC) {
          currentFps = Math.round((frameCount * MS_PER_SEC) / fpsAccum);
          frameCount = 0;
          fpsAccum %= MS_PER_SEC;
        }
        rafId = requestAnimationFrame(tick);
      };
      let rafId = requestAnimationFrame(tick);
      yield* Effect.addFinalizer(() => Effect.sync(() => cancelAnimationFrame(rafId)));
    }

    const budget: FrameBudgetShape = {
      remaining(): number {
        if (typeof performance === 'undefined') return frameBudgetMs;
        return Math.max(0, frameBudgetMs - (performance.now() - frameStart));
      },

      canRun(priority: Priority): boolean {
        const rem = budget.remaining();
        return rem >= PRIORITY_THRESHOLDS[priority]!;
      },

      scheduleSync<A>(priority: Priority, task: () => A): A | null {
        if (budget.canRun(priority) || priority === 'critical') {
          return task();
        }
        return null;
      },

      schedule<A>(priority: Priority, task: Effect.Effect<A>): Effect.Effect<A | null> {
        return Effect.gen(function* () {
          if (priority === 'critical' || budget.canRun(priority)) {
            return yield* task;
          }
          return null;
        });
      },

      fps: Effect.sync(() => currentFps),

      get fpsSync(): number {
        return currentFps;
      },
    };

    return budget;
  });
}

/**
 * FrameBudget -- rAF-based frame budget manager with priority lanes.
 * Tracks remaining time per animation frame and gates work by priority:
 * `critical` (always runs) `> high > low > idle`.
 *
 * @example
 * ```ts
 * const program = Effect.scoped(Effect.gen(function* () {
 *   const budget = yield* FrameBudget.make({ targetFps: 60 });
 *   if (budget.canRun('high')) {
 *     yield* budget.schedule('high', Effect.succeed('rendered'));
 *   }
 *   const fps = yield* budget.fps; // current measured FPS
 * }));
 * ```
 */
export const FrameBudget = { make: _make };

export declare namespace FrameBudget {
  /** Structural shape of a {@link FrameBudget} instance — `canRun`, `schedule`, `remaining`, `fps`. */
  export type Shape = FrameBudgetShape;
}
