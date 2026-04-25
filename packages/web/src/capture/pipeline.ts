/**
 * Capture pipeline -- end-to-end VideoRenderer through FrameCapture to
 * CaptureResult.
 *
 * Orchestrates the rendering loop: creates an OffscreenCanvas when
 * available, falls back to an HTMLCanvasElement otherwise, iterates
 * through VideoRenderer frames, renders each to canvas, captures the
 * result, and finalises the encoding.
 *
 * @module
 */

import type { VideoRenderer, FrameCapture, CaptureResult } from '@czap/core';
import { renderToCanvas, type Canvas2DTarget, type RenderFn } from './render.js';

function createRenderCanvas(width: number, height: number): Canvas2DTarget {
  if (typeof OffscreenCanvas === 'function') {
    return new OffscreenCanvas(width, height);
  }

  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  throw new Error('captureVideo requires OffscreenCanvas or HTMLCanvasElement support.');
}

async function toCaptureBitmap(canvas: Canvas2DTarget): Promise<ImageBitmap | OffscreenCanvas> {
  if (typeof OffscreenCanvas === 'function' && canvas instanceof OffscreenCanvas) {
    return canvas;
  }

  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(canvas);
  }

  throw new Error('captureVideo requires createImageBitmap when OffscreenCanvas is unavailable.');
}

/**
 * Capture a video from a VideoRenderer using a FrameCapture backend.
 *
 * @param renderer - The VideoRenderer producing deterministic frames
 * @param capture - The FrameCapture implementation (WebCodecs, Remotion, etc.)
 * @param renderFn - Optional custom render function for canvas rendering
 * @returns The finalized CaptureResult with the encoded video blob
 */
export async function captureVideo(
  renderer: VideoRenderer.Shape,
  capture: FrameCapture,
  renderFn?: RenderFn,
): Promise<CaptureResult> {
  const { width, height, fps } = renderer.config;

  // Initialize capture backend
  await capture.init({ width, height, fps });

  // Render into an off-thread canvas when available, otherwise fall back to a DOM canvas.
  const canvas = createRenderCanvas(width, height);

  // Process each frame
  for await (const frame of renderer.frames()) {
    // Render CompositeState to canvas
    renderToCanvas(frame.state, canvas, renderFn);

    const bitmap = await toCaptureBitmap(canvas);

    try {
      await capture.capture({
        frame: frame.frame,
        timestamp: frame.timestamp,
        bitmap,
      });
    } finally {
      if (bitmap !== canvas && 'close' in bitmap && typeof bitmap.close === 'function') {
        bitmap.close();
      }
    }
  }

  // Finalize and return result
  return capture.finalize();
}
