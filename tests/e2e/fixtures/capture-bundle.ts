/**
 * E2E capture harness entry point.
 *
 * Bundled via Vite build into an ES module for the browser test page.
 * Runs the full capture pipeline: Compositor -> VideoRenderer -> WebCodecsCapture -> MP4 blob.
 */

import { Effect } from 'effect';
import { Compositor, VideoRenderer, Millis } from '@czap/core';
import { WebCodecsCapture, renderToCanvas } from '@czap/web';

declare global {
  interface Window {
    __capturePromise: Promise<void>;
    __captureResult: {
      frames: number;
      durationMs: number;
      codec: string;
      blobSize: number;
      blobType: string;
      blobUrl: string;
    };
    __captureError: string | null;
  }
}

async function run() {
  const compositor = Effect.runSync(Effect.scoped(Compositor.create()));
  const renderer = VideoRenderer.make({ fps: 10, width: 640, height: 480, durationMs: Millis(500) }, compositor);

  const capture = WebCodecsCapture.make({
    codec: 'avc1.42001E',
    bitrate: 1_000_000,
    keyframeInterval: 5,
  });

  await capture.init({
    width: renderer.config.width,
    height: renderer.config.height,
    fps: renderer.config.fps,
  });

  const canvas = document.createElement('canvas');
  canvas.width = renderer.config.width;
  canvas.height = renderer.config.height;

  const nextFrame = () =>
    new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });

  for await (const frame of renderer.frames()) {
    renderToCanvas(frame.state, canvas);
    await nextFrame();
    const bitmap = await createImageBitmap(canvas);
    try {
      await capture.capture({
        frame: frame.frame,
        timestamp: frame.timestamp,
        bitmap,
      });
    } finally {
      bitmap.close();
    }
  }

  const result = await capture.finalize();
  const blobUrl = URL.createObjectURL(result.blob);

  window.__captureResult = {
    frames: result.frames,
    durationMs: result.durationMs,
    codec: result.codec,
    blobSize: result.blob.size,
    blobType: result.blob.type,
    blobUrl,
  };
}

window.__captureError = null;
window.__capturePromise = run().catch((err) => {
  window.__captureError = String(err);
  console.error('Capture failed:', err);
});
