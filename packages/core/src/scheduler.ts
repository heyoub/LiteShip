/**
 * Scheduler -- clock abstraction decoupling animation from requestAnimationFrame.
 *
 * Four implementations:
 *   - raf: browser real-time (default)
 *   - noop: SSR-safe
 *   - fixedStep: deterministic timestamps at target fps (video rendering)
 *   - audioSync: ticks in lockstep with an AVBridge sample counter
 *
 * @module
 */

import type { AVBridge } from './av-bridge.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SchedulerShape {
  readonly _tag: 'FrameScheduler';
  schedule(callback: (now: number) => void): number;
  cancel(id: number): void;
}

interface FixedStepShape extends SchedulerShape {
  step(): void;
  readonly frame: number;
}

// ---------------------------------------------------------------------------
// Implementations
// ---------------------------------------------------------------------------

/** Default: requestAnimationFrame. Used by Timeline/animate in browser. */
function _raf(): SchedulerShape {
  return {
    _tag: 'FrameScheduler',
    schedule: (cb) => requestAnimationFrame(cb),
    cancel: (id) => cancelAnimationFrame(id),
  };
}

/** SSR-safe: noop scheduler for server environments. */
function _noop(): SchedulerShape {
  return {
    _tag: 'FrameScheduler',
    schedule: () => 0,
    cancel: () => {},
  };
}

/** Fixed-step: deterministic timestamps at target fps. For video rendering.
 *  Uses a class for V8 hidden-class optimization (stable inline caches). */
class FixedStepSchedulerImpl implements FixedStepShape {
  readonly _tag = 'FrameScheduler' as const;
  _frame: number = 0;
  _cb: ((now: number) => void) | null = null;
  _dt: number;

  constructor(fps: number) {
    this._dt = 1000 / fps;
  }

  get frame() {
    return this._frame;
  }

  schedule(cb: (now: number) => void) {
    this._cb = cb;
    return this._frame;
  }

  cancel() {
    this._cb = null;
  }

  step() {
    const cb = this._cb;
    if (cb) {
      this._cb = null;
      cb(this._frame * this._dt);
    }
    this._frame++;
  }
}

function _fixedStep(fps: number): FixedStepShape {
  return new FixedStepSchedulerImpl(fps);
}

// ---------------------------------------------------------------------------
// Audio-sync scheduler
// ---------------------------------------------------------------------------

interface AudioSyncShape extends SchedulerShape {
  poll(): void;
  readonly frame: number;
  readonly bridge: AVBridge.Shape;
}

function _audioSync(bridge: AVBridge.Shape): AudioSyncShape {
  let lastFrame = -1;
  let pendingCallback: ((now: number) => void) | null = null;

  return {
    _tag: 'FrameScheduler',
    bridge,

    get frame() {
      return bridge.getCurrentFrame();
    },

    schedule(cb) {
      pendingCallback = cb;
      return bridge.getCurrentFrame();
    },

    cancel() {
      pendingCallback = null;
    },

    poll() {
      const currentFrame = bridge.getCurrentFrame();
      if (currentFrame !== lastFrame) {
        lastFrame = currentFrame;
        const cb = pendingCallback;
        if (cb) {
          pendingCallback = null;
          const timestampMs = bridge.sampleToTime(bridge.getCurrentSample()) * 1000;
          cb(timestampMs);
        }
      }
    },
  };
}

/**
 * Scheduler — clock abstraction that decouples animation driver from real time.
 * Pick the impl that matches the runtime: `raf` in browser, `noop` on the
 * server, `fixedStep` for deterministic video render, `audioSync` to drive UI
 * in lockstep with an {@link AVBridge}.
 */
export const Scheduler = {
  /** `requestAnimationFrame`-backed scheduler for browser real-time work. */
  raf: _raf,
  /** No-op scheduler for SSR / environments without rAF. */
  noop: _noop,
  /** Fixed-step scheduler at the given fps — deterministic timestamps for offline rendering. */
  fixedStep: _fixedStep,
  /** Scheduler that polls an {@link AVBridge} and fires callbacks when the sample frame advances. */
  audioSync: _audioSync,
};

export declare namespace Scheduler {
  /** Common structural shape every scheduler variant satisfies. */
  export type Shape = SchedulerShape;
  /** Fixed-step scheduler with manual `step()` advancement. */
  export type FixedStep = FixedStepShape;
  /** Audio-synchronized scheduler bound to an {@link AVBridge}. */
  export type AudioSync = AudioSyncShape;
}
