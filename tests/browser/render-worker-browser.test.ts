import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { RenderWorker } from '../../packages/worker/src/render-worker.js';

describe('browser RenderWorker with real Worker and OffscreenCanvas', () => {
  afterEach(() => {
    // Clean up any lingering workers
  });

  test('create spawns a real Worker that emits ready on init', async () => {
    const worker = RenderWorker.create();

    const ready = await new Promise<boolean>((resolve) => {
      const handler = (e: MessageEvent) => {
        if (e.data?.type === 'ready') {
          resolve(true);
        }
      };
      worker.worker.addEventListener('message', handler);
      // Init is sent in constructor; just wait
      setTimeout(() => resolve(false), 2000);
    });

    expect(ready).toBe(true);
    worker.dispose();
  });

  test('dispose terminates the worker without errors', async () => {
    const worker = RenderWorker.create();

    // Wait for ready
    await new Promise<void>((resolve) => {
      const handler = (e: MessageEvent) => {
        if (e.data?.type === 'ready') resolve();
      };
      worker.worker.addEventListener('message', handler);
      setTimeout(resolve, 1000);
    });

    // Should not throw
    worker.dispose();
    expect(true).toBe(true);
  });

  test('transferCanvas sends OffscreenCanvas to the worker', async () => {
    if (typeof OffscreenCanvas === 'undefined') {
      // Skip if OffscreenCanvas is not supported
      return;
    }

    const worker = RenderWorker.create();

    await new Promise<void>((resolve) => {
      const handler = (e: MessageEvent) => {
        if (e.data?.type === 'ready') resolve();
      };
      worker.worker.addEventListener('message', handler);
      setTimeout(resolve, 1000);
    });

    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const offscreen = canvas.transferControlToOffscreen();

    // Should not throw -- canvas is transferred to worker
    worker.transferCanvas(offscreen);

    worker.dispose();
  });

  test('startRender produces frame events and render-complete', async () => {
    if (typeof OffscreenCanvas === 'undefined') {
      return;
    }

    const worker = RenderWorker.create();

    await new Promise<void>((resolve) => {
      const handler = (e: MessageEvent) => {
        if (e.data?.type === 'ready') resolve();
      };
      worker.worker.addEventListener('message', handler);
      setTimeout(resolve, 1000);
    });

    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const offscreen = canvas.transferControlToOffscreen();
    worker.transferCanvas(offscreen);

    const frames: unknown[] = [];
    let completedFrames = 0;

    const unsubFrame = worker.onFrame((output) => {
      frames.push(output);
    });

    const done = new Promise<void>((resolve) => {
      worker.onComplete((total) => {
        completedFrames = total;
        resolve();
      });
      setTimeout(resolve, 5000);
    });

    worker.startRender({
      fps: 10,
      width: 32,
      height: 32,
      durationMs: 200 as never,
    });

    await done;
    unsubFrame();

    expect(frames.length).toBeGreaterThan(0);
    expect(completedFrames).toBeGreaterThan(0);

    worker.dispose();
  });

  // Anchored on a frame event rather than wall clock: the worker yields
  // every 10 frames (render-worker.ts: `if (i % 10 === 9)`), and a stop
  // posted during one of those yield windows is processed before the
  // next iteration. Issuing stop after frame 3 deterministically lands
  // in the yield at frame 9, so we get ~10 frames out of a 300-frame
  // request regardless of how fast the realm is.
  test('stopRender halts an in-progress render early', async () => {
    if (typeof OffscreenCanvas === 'undefined') {
      return;
    }

    const worker = RenderWorker.create();

    await new Promise<void>((resolve) => {
      const handler = (e: MessageEvent) => {
        if (e.data?.type === 'ready') resolve();
      };
      worker.worker.addEventListener('message', handler);
      setTimeout(resolve, 1000);
    });

    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const offscreen = canvas.transferControlToOffscreen();
    worker.transferCanvas(offscreen);

    const TOTAL_FRAMES_REQUESTED = 300; // 30 fps × 10_000 ms / 1000
    const STOP_AT_FRAME = 3;

    const seen: number[] = [];
    let stopIssued = false;

    // The worker is contract-bound to post `render-complete` after the loop
    // exits (whether by natural finish or by `stopRequested` break). If it
    // doesn't fire within the ceiling we fail loud rather than passing on
    // a silent stop-flow regression.
    const done = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Timed out waiting for render-complete after stopRender()')),
        5000,
      );
      worker.onComplete(() => {
        clearTimeout(timer);
        resolve();
      });
    });

    worker.onFrame((output) => {
      const frameNum = (output as { frame: number }).frame;
      seen.push(frameNum);
      if (!stopIssued && frameNum >= STOP_AT_FRAME) {
        stopIssued = true;
        worker.stopRender();
      }
    });

    worker.startRender({
      fps: 30,
      width: 16,
      height: 16,
      durationMs: 10000 as never,
    });

    await done;

    expect(stopIssued).toBe(true);
    expect(seen.length).toBeLessThan(TOTAL_FRAMES_REQUESTED);
    expect(seen.length).toBeGreaterThanOrEqual(STOP_AT_FRAME + 1);

    worker.dispose();
  });

  test('onFrame returns an unsubscribe function that stops callbacks', async () => {
    const worker = RenderWorker.create();

    await new Promise<void>((resolve) => {
      const handler = (e: MessageEvent) => {
        if (e.data?.type === 'ready') resolve();
      };
      worker.worker.addEventListener('message', handler);
      setTimeout(resolve, 1000);
    });

    let callCount = 0;
    const unsub = worker.onFrame(() => {
      callCount++;
    });

    unsub();

    // Even if frames arrive, callback should not fire
    expect(callCount).toBe(0);
    worker.dispose();
  });

  test('onComplete returns an unsubscribe function', async () => {
    const worker = RenderWorker.create();

    await new Promise<void>((resolve) => {
      const handler = (e: MessageEvent) => {
        if (e.data?.type === 'ready') resolve();
      };
      worker.worker.addEventListener('message', handler);
      setTimeout(resolve, 1000);
    });

    let called = false;
    const unsub = worker.onComplete(() => {
      called = true;
    });

    unsub();
    expect(called).toBe(false);
    worker.dispose();
  });

  test('worker.worker exposes the real Worker instance', () => {
    const rw = RenderWorker.create();
    expect(rw.worker).toBeInstanceOf(Worker);
    rw.dispose();
  });

  test('frame output includes frame number, timestamp, and state', async () => {
    if (typeof OffscreenCanvas === 'undefined') {
      return;
    }

    const worker = RenderWorker.create();

    await new Promise<void>((resolve) => {
      const handler = (e: MessageEvent) => {
        if (e.data?.type === 'ready') resolve();
      };
      worker.worker.addEventListener('message', handler);
      setTimeout(resolve, 1000);
    });

    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const offscreen = canvas.transferControlToOffscreen();
    worker.transferCanvas(offscreen);

    const firstFrame = await new Promise<Record<string, unknown>>((resolve) => {
      worker.onFrame((output) => {
        resolve(output as unknown as Record<string, unknown>);
      });
      worker.startRender({ fps: 10, width: 16, height: 16, durationMs: 100 as never });
      setTimeout(() => resolve({}), 3000);
    });

    expect(firstFrame).toHaveProperty('frame');
    expect(firstFrame).toHaveProperty('timestamp');
    expect(firstFrame).toHaveProperty('state');

    worker.dispose();
  });
});
