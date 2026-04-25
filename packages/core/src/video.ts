/**
 * VideoRenderer -- fixed-step frame generator for deterministic video rendering.
 *
 * Same compositor, same state pipeline -- different clock. The VideoRenderer
 * drives a FixedStepScheduler at target fps, producing VideoFrameOutput
 * per frame with the full CompositeState snapshot.
 *
 * @module
 */

import type { Scheduler } from './scheduler.js';
import { Scheduler as SchedulerImpl } from './scheduler.js';
import type { CompositeState, Compositor } from './compositor.js';
import type { Signal } from './signal.js';
import type { Millis } from './brands.js';
import { Effect } from 'effect';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Configuration for a {@link VideoRenderer}: resolution, target fps, and total duration. */
export interface VideoConfig {
  readonly fps: number;
  readonly width: number;
  readonly height: number;
  readonly durationMs: Millis;
}

/**
 * Single frame yielded by `VideoRenderer.frames()`: frame index, timestamp,
 * normalized progress, and the {@link CompositeState} snapshot captured at that tick.
 */
export interface VideoFrameOutput {
  readonly frame: number;
  readonly timestamp: number;
  readonly progress: number;
  readonly state: CompositeState;
}

interface VideoRendererShape {
  readonly config: VideoConfig;
  readonly totalFrames: number;
  readonly scheduler: Scheduler.FixedStep;
  frames(): AsyncGenerator<VideoFrameOutput>;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a video renderer that produces deterministic frames from a Compositor.
 *
 * Each call to `frames()` returns an async generator yielding one
 * `VideoFrameOutput` per frame at the configured fps/duration.
 *
 * When a `signal` is provided it is seeked to each frame's timestamp before
 * the compositor evaluates, so quantizers that read from that signal advance
 * deterministically with the render clock.
 */
function _make(
  config: VideoConfig,
  compositor: Compositor.Shape,
  signal?: Signal.Controllable<number>,
): VideoRendererShape {
  const totalFrames = Math.ceil((config.durationMs / 1000) * config.fps);
  const scheduler = SchedulerImpl.fixedStep(config.fps);

  return {
    config,
    totalFrames,
    scheduler,
    async *frames(): AsyncGenerator<VideoFrameOutput> {
      for (let i = 0; i < totalFrames; i++) {
        scheduler.step();
        const timestamp = (i * 1000) / config.fps;
        if (signal) {
          Effect.runSync(signal.seek(timestamp));
        }
        const state = Effect.runSync(compositor.compute());
        yield {
          frame: i,
          timestamp,
          progress: totalFrames > 1 ? i / (totalFrames - 1) : 1,
          state,
        };
      }
    },
  };
}

/**
 * VideoRenderer — fixed-step frame generator for deterministic offline rendering.
 * Drives a {@link Compositor} at the configured fps and optionally seeks a
 * controllable time {@link Signal} so every frame is reproducible.
 */
export const VideoRenderer = {
  /** Create a renderer bound to the given compositor and optional seekable time signal. */
  make: _make,
};

export declare namespace VideoRenderer {
  /** Structural shape of a renderer instance returned by {@link VideoRenderer.make}. */
  export type Shape = VideoRendererShape;
}
