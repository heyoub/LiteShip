/**
 * WebCodecs capture E2E test.
 *
 * Verifies the full pipeline in a real browser:
 * Compositor -> VideoRenderer -> WebCodecsCapture (mediabunny) -> valid MP4 blob.
 */

import { test, expect } from '@playwright/test';

test.describe('WebCodecs Capture Pipeline', () => {
  test('produces a non-empty MP4 blob with correct metadata', async ({ page }) => {
    await page.goto('/capture-harness.html');

    // Wait for capture to complete (or error)
    const result = await page.evaluate(async () => {
      await window.__capturePromise;
      if (window.__captureError) throw new Error(window.__captureError);
      return window.__captureResult;
    });

    // 500ms at 10fps = 5 frames
    expect(result.frames).toBe(5);
    expect(result.durationMs).toBeCloseTo(500, -1);
    expect(result.codec).toContain('avc');
    expect(result.blobSize).toBeGreaterThan(0);
    expect(result.blobType).toBe('video/mp4');
  });

  test('MP4 blob is loadable by a <video> element', async ({ page }) => {
    await page.goto('/capture-harness.html');

    const videoLoadResult = await page.evaluate(async () => {
      await window.__capturePromise;
      if (window.__captureError) throw new Error(window.__captureError);

      const blobUrl = window.__captureResult.blobUrl;
      const video = document.createElement('video');
      video.src = blobUrl;
      video.muted = true;

      return new Promise<{ duration: number; videoWidth: number; videoHeight: number }>((resolve, reject) => {
        video.onloadedmetadata = () => {
          resolve({
            duration: video.duration,
            videoWidth: video.videoWidth,
            videoHeight: video.videoHeight,
          });
        };
        video.onerror = () => {
          reject(new Error('Video element failed to load MP4 -- invalid muxer output'));
        };
        setTimeout(() => reject(new Error('Video load timed out')), 10_000);
      });
    });

    expect(videoLoadResult.duration).toBeGreaterThan(0);
    expect(videoLoadResult.videoWidth).toBe(640);
    expect(videoLoadResult.videoHeight).toBe(480);
  });
});
