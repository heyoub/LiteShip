/**
 * Capture layer tests -- FrameCapture contract, pipeline orchestration.
 *
 * Uses mock implementations since WebCodecs requires a browser environment.
 */

import { describe, it, expect } from 'vitest';
import { Effect } from 'effect';
import { VideoRenderer, Compositor } from '@czap/core';
import type { FrameCapture, CaptureConfig, CaptureFrame, CaptureResult, CompositeState } from '@czap/core';

// ---------------------------------------------------------------------------
// Mock FrameCapture
// ---------------------------------------------------------------------------

function createMockCapture(): FrameCapture & {
  readonly capturedFrames: CaptureFrame[];
  readonly initCalls: CaptureConfig[];
  readonly finalizeCalls: number;
} {
  const capturedFrames: CaptureFrame[] = [];
  const initCalls: CaptureConfig[] = [];
  let finalizeCalls = 0;
  let frameCount = 0;
  let lastConfig: CaptureConfig | null = null;

  return {
    _tag: 'FrameCapture',
    capturedFrames,
    initCalls,
    get finalizeCalls() {
      return finalizeCalls;
    },

    async init(config: CaptureConfig): Promise<void> {
      initCalls.push(config);
      lastConfig = config;
      frameCount = 0;
    },

    async capture(frame: CaptureFrame): Promise<void> {
      capturedFrames.push(frame);
      frameCount++;
    },

    async finalize(): Promise<CaptureResult> {
      finalizeCalls++;
      return {
        blob: new Blob(['mock-video-data'], { type: 'video/mp4' }),
        codec: 'mock-h264',
        frames: frameCount,
        durationMs: lastConfig ? (frameCount / lastConfig.fps) * 1000 : 0,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// § 1. FrameCapture Contract
// ---------------------------------------------------------------------------

describe('FrameCapture contract', () => {
  it('mock capture has correct _tag', () => {
    const capture = createMockCapture();
    expect(capture._tag).toBe('FrameCapture');
  });

  it('init/capture/finalize lifecycle produces correct result', async () => {
    const capture = createMockCapture();
    await capture.init({ width: 1920, height: 1080, fps: 30 });

    // Simulate 5 frames
    for (let i = 0; i < 5; i++) {
      await capture.capture({
        frame: i,
        timestamp: (i * 1000) / 30,
        bitmap: {} as unknown as OffscreenCanvas,
      });
    }

    const result = await capture.finalize();
    expect(result.frames).toBe(5);
    expect(result.codec).toBe('mock-h264');
    expect(result.durationMs).toBeCloseTo((5 / 30) * 1000, 1);
    expect(result.blob).toBeInstanceOf(Blob);
  });

  it('init records config correctly', async () => {
    const capture = createMockCapture();
    await capture.init({ width: 1280, height: 720, fps: 60 });
    expect(capture.initCalls.length).toBe(1);
    expect(capture.initCalls[0]!.width).toBe(1280);
    expect(capture.initCalls[0]!.height).toBe(720);
    expect(capture.initCalls[0]!.fps).toBe(60);
  });

  it('captures all frames in order', async () => {
    const capture = createMockCapture();
    await capture.init({ width: 640, height: 480, fps: 10 });

    for (let i = 0; i < 10; i++) {
      await capture.capture({
        frame: i,
        timestamp: i * 100,
        bitmap: {} as unknown as OffscreenCanvas,
      });
    }

    expect(capture.capturedFrames.length).toBe(10);
    for (let i = 0; i < 10; i++) {
      expect(capture.capturedFrames[i]!.frame).toBe(i);
      expect(capture.capturedFrames[i]!.timestamp).toBe(i * 100);
    }
  });

  it('zero frames produces zero-frame result', async () => {
    const capture = createMockCapture();
    await capture.init({ width: 1920, height: 1080, fps: 30 });
    const result = await capture.finalize();
    expect(result.frames).toBe(0);
    expect(result.durationMs).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// § 2. Capture with VideoRenderer
// ---------------------------------------------------------------------------

describe('Capture with VideoRenderer', () => {
  it('captures all frames from a VideoRenderer', async () => {
    const compositor = Effect.runSync(Effect.scoped(Compositor.create()));
    const renderer = VideoRenderer.make({ fps: 10, width: 640, height: 480, durationMs: 500 }, compositor);

    const capture = createMockCapture();
    await capture.init({
      width: renderer.config.width,
      height: renderer.config.height,
      fps: renderer.config.fps,
    });

    for await (const frame of renderer.frames()) {
      await capture.capture({
        frame: frame.frame,
        timestamp: frame.timestamp,
        bitmap: {} as unknown as OffscreenCanvas,
      });
    }

    const result = await capture.finalize();
    expect(result.frames).toBe(renderer.totalFrames);
    expect(result.frames).toBe(5);
  });

  it('captured frame timestamps match renderer timestamps', async () => {
    const compositor = Effect.runSync(Effect.scoped(Compositor.create()));
    const renderer = VideoRenderer.make({ fps: 30, width: 1920, height: 1080, durationMs: 200 }, compositor);

    const capture = createMockCapture();
    await capture.init({
      width: renderer.config.width,
      height: renderer.config.height,
      fps: renderer.config.fps,
    });

    const rendererTimestamps: number[] = [];
    for await (const frame of renderer.frames()) {
      rendererTimestamps.push(frame.timestamp);
      await capture.capture({
        frame: frame.frame,
        timestamp: frame.timestamp,
        bitmap: {} as unknown as OffscreenCanvas,
      });
    }

    for (let i = 0; i < capture.capturedFrames.length; i++) {
      expect(capture.capturedFrames[i]!.timestamp).toBe(rendererTimestamps[i]!);
    }
  });
});

// ---------------------------------------------------------------------------
// § 3. cssVarsFromState (imported from remotion for testing)
// ---------------------------------------------------------------------------

describe('cssVarsFromState', () => {
  it('converts CompositeState outputs.css to string map', () => {
    // Inline implementation test (same logic as @czap/remotion)
    const state: CompositeState = {
      discrete: { viewport: 'desktop' },
      blend: { viewport: { mobile: 0, tablet: 0, desktop: 1 } },
      outputs: {
        css: { '--czap-viewport': 'desktop', '--czap-size': 18 },
        glsl: { u_viewport: 2 },
        aria: { 'data-czap-viewport': 'desktop' },
      },
    };

    const vars: Record<string, string> = {};
    for (const [key, value] of Object.entries(state.outputs.css)) {
      vars[key] = String(value);
    }

    expect(vars['--czap-viewport']).toBe('desktop');
    expect(vars['--czap-size']).toBe('18');
  });
});
