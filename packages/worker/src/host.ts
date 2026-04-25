/**
 * WorkerHost -- main-thread coordinator for compositor and render workers.
 *
 * Provides a unified API for:
 * - Managing a CompositorWorker (off-thread state computation)
 * - Managing a RenderWorker (off-thread OffscreenCanvas rendering)
 * - Attaching an HTMLCanvasElement for off-thread rendering
 * - Subscribing to state updates from the compositor worker
 *
 * @module
 */

import type { CompositeState, VideoConfig } from '@czap/core';
import type { WorkerConfig } from './messages.js';
import { CompositorWorker, type CompositorWorkerStartupTelemetry } from './compositor-worker.js';
import { RenderWorker } from './render-worker.js';

type WorkerHostState = CompositeState & {
  readonly resolvedStateGenerations?: Record<string, number>;
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Host-facing surface of a worker host. Owns a compositor worker and,
 * optionally, a render worker created on demand via
 * {@link WorkerHostShape.attachCanvas}. Returned by {@link WorkerHost.create}.
 */
export interface WorkerHostShape {
  /** The compositor worker instance. */
  readonly compositor: CompositorWorker.Shape;

  /** The render worker instance, or null if no canvas has been attached. */
  readonly renderer: RenderWorker.Shape | null;

  /**
   * Attach an HTMLCanvasElement for off-thread rendering.
   *
   * Calls `canvas.transferControlToOffscreen()` and transfers the
   * resulting OffscreenCanvas to the render worker. A render worker
   * is created on demand if one does not already exist.
   *
   * This can only be called once per canvas element -- the browser
   * does not allow transferring control multiple times.
   */
  attachCanvas(canvas: HTMLCanvasElement): void;

  /** Start off-thread video rendering with the given configuration. */
  startRender(config: VideoConfig): void;

  /** Stop an in-progress off-thread render. */
  stopRender(): void;

  /**
   * Subscribe to CompositeState updates from the compositor worker.
   * Returns an unsubscribe function.
   */
  onState(callback: (state: WorkerHostState) => void): () => void;

  /** Dispose both workers and release all resources. */
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

function _createWorkerHost(
  config?: WorkerConfig,
  startupTelemetry?: CompositorWorkerStartupTelemetry,
): WorkerHostShape {
  const compositor = CompositorWorker.create(config, startupTelemetry);
  let renderer: RenderWorker.Shape | null = null;

  // Forward compositor state to the render worker's quantizer registry.
  // This keeps the render worker's internal state in sync when the
  // compositor produces new states.
  const stateUnsubscribers: Array<() => void> = [];

  const host: WorkerHostShape = {
    get compositor(): CompositorWorker.Shape {
      return compositor;
    },

    get renderer(): RenderWorker.Shape | null {
      return renderer;
    },

    attachCanvas(canvas: HTMLCanvasElement): void {
      if (renderer === null) {
        renderer = RenderWorker.create();
      }

      // Transfer control to an OffscreenCanvas and send it to the worker.
      // `transferControlToOffscreen()` can only be called once per element.
      const offscreen = canvas.transferControlToOffscreen();
      renderer.transferCanvas(offscreen);
    },

    startRender(videoConfig: VideoConfig): void {
      if (renderer === null) {
        throw new Error('WorkerHost: cannot start render -- no canvas attached. Call attachCanvas() first.');
      }
      renderer.startRender(videoConfig);
    },

    stopRender(): void {
      if (renderer !== null) {
        renderer.stopRender();
      }
    },

    onState(callback: (state: WorkerHostState) => void): () => void {
      const unsub = compositor.onState(callback);
      stateUnsubscribers.push(unsub);
      return () => {
        const index = stateUnsubscribers.indexOf(unsub);
        if (index >= 0) {
          stateUnsubscribers.splice(index, 1);
        }
        unsub();
      };
    },

    dispose(): void {
      for (const unsub of stateUnsubscribers) unsub();
      stateUnsubscribers.length = 0;

      compositor.dispose();
      if (renderer !== null) {
        renderer.dispose();
        renderer = null;
      }
    },
  };

  return host;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/**
 * `WorkerHost` -- main-thread lifecycle wrapper that owns a
 * {@link CompositorWorker.Shape} and (optionally) a
 * {@link RenderWorker.Shape}, exposing a single unified surface for DOM
 * integration.
 *
 * Typical flow:
 * 1. `const host = WorkerHost.create({...})` on the main thread.
 * 2. `host.attachCanvas(canvasEl)` to lazily mint a render worker and
 *    transfer its `OffscreenCanvas`.
 * 3. `host.startRender(videoConfig)` / `host.stopRender()` to control
 *    the render loop.
 * 4. `host.onState(cb)` to subscribe to composite state updates.
 * 5. `host.dispose()` when the host is unmounted -- releases both
 *    workers and every subscription.
 *
 * @example
 * ```ts
 * import { WorkerHost } from '@czap/worker';
 *
 * const host = WorkerHost.create({ poolCapacity: 64 });
 * host.attachCanvas(canvas);
 * host.startRender({ durationMs: 5000, fps: 60, width: 1280, height: 720 });
 * const unsub = host.onState((state) => console.log(state.discrete));
 * // ...
 * unsub();
 * host.dispose();
 * ```
 */
export const WorkerHost = {
  /**
   * Create a worker host. The compositor worker starts immediately; the
   * render worker is created lazily on the first
   * {@link WorkerHostShape.attachCanvas} call.
   */
  create: _createWorkerHost,
} as const;

export declare namespace WorkerHost {
  /** Public host surface returned by {@link WorkerHost.create}. */
  export type Shape = WorkerHostShape;
  /** Telemetry sink forwarded to the inner compositor worker. */
  export type StartupTelemetry = CompositorWorkerStartupTelemetry;
}
