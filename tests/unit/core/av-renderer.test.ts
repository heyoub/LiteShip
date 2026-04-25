/**
 * AVRenderer -- deterministic offline A/V rendering tests.
 */

import { describe, test, expect, vi } from 'vitest';
import { Effect, Scope } from 'effect';
import { AVRenderer, AVBridge, Compositor, Millis } from '@czap/core';

function makeCompositor() {
  return Effect.runPromise(Effect.scoped(Compositor.create()));
}

describe('AVRenderer frame generation', () => {
  test('computes correct totalFrames', async () => {
    const renderer = AVRenderer.make({ sampleRate: 48000, fps: 30, durationMs: Millis(5000) }, await makeCompositor());
    expect(renderer.totalFrames).toBe(150);
  });

  test('yields the correct number of frames', async () => {
    const renderer = AVRenderer.make({ sampleRate: 48000, fps: 30, durationMs: Millis(1000) }, await makeCompositor());
    let count = 0;
    for await (const _ of renderer.frames()) count++;
    expect(count).toBe(30);
  });

  test('durationMs: Millis(0) yields zero frames', async () => {
    const renderer = AVRenderer.make({ sampleRate: 48000, fps: 30, durationMs: Millis(0) }, await makeCompositor());
    expect(renderer.totalFrames).toBe(0);
    let count = 0;
    for await (const _ of renderer.frames()) count++;
    expect(count).toBe(0);
  });

  test('single frame at very short duration', async () => {
    const renderer = AVRenderer.make({ sampleRate: 48000, fps: 30, durationMs: Millis(10) }, await makeCompositor());
    expect(renderer.totalFrames).toBe(1);
    let count = 0;
    for await (const _ of renderer.frames()) count++;
    expect(count).toBe(1);
  });
});

describe('AVRenderer audio-visual alignment', () => {
  test('each frame has correct sample position', async () => {
    const renderer = AVRenderer.make({ sampleRate: 48000, fps: 30, durationMs: Millis(1000) }, await makeCompositor());

    const samplesPerFrame = Math.round(48000 / 30);
    const frames: Array<{ frame: number; sample: number; sampleCount: number }> = [];

    for await (const f of renderer.frames()) {
      frames.push({ frame: f.frame, sample: f.sample, sampleCount: f.sampleCount });
    }

    expect(frames.length).toBe(30);
    for (let i = 0; i < frames.length; i++) {
      expect(frames[i]!.frame).toBe(i);
      expect(frames[i]!.sample).toBe(i * samplesPerFrame);
      expect(frames[i]!.sampleCount).toBe(samplesPerFrame);
    }
  });

  test('timestamps increment correctly', async () => {
    const renderer = AVRenderer.make({ sampleRate: 48000, fps: 60, durationMs: Millis(500) }, await makeCompositor());

    const timestamps: number[] = [];
    for await (const f of renderer.frames()) {
      timestamps.push(f.timestamp);
    }

    for (let i = 1; i < timestamps.length; i++) {
      const dt = timestamps[i]! - timestamps[i - 1]!;
      expect(dt).toBeCloseTo(1000 / 60, 1);
    }
  });

  test('bridge sample counter matches total after rendering', async () => {
    const renderer = AVRenderer.make({ sampleRate: 48000, fps: 30, durationMs: Millis(1000) }, await makeCompositor());

    for await (const _ of renderer.frames()) {
    }

    const samplesPerFrame = Math.round(48000 / 30);
    expect(renderer.bridge.getCurrentSample()).toBe(30 * samplesPerFrame);
  });
});

describe('AVRenderer callbacks', () => {
  test('onAudioFrame is called for each frame', async () => {
    const renderer = AVRenderer.make({ sampleRate: 48000, fps: 30, durationMs: Millis(500) }, await makeCompositor());

    const audioCalls: Array<{ sample: number; count: number }> = [];
    for await (const _ of renderer.frames({
      onAudioFrame: (sample, count) => audioCalls.push({ sample, count }),
    })) {
    }

    expect(audioCalls.length).toBe(15);
    expect(audioCalls[0]!.sample).toBe(0);
    expect(audioCalls[0]!.count).toBe(1600);
  });

  test('onVideoFrame is called for each frame', async () => {
    const renderer = AVRenderer.make({ sampleRate: 48000, fps: 10, durationMs: Millis(300) }, await makeCompositor());

    const videoCalls: Array<{ frame: number; timestamp: number }> = [];
    for await (const _ of renderer.frames({
      onVideoFrame: (frame, timestamp) => videoCalls.push({ frame, timestamp }),
    })) {
    }

    expect(videoCalls.length).toBe(3);
    expect(videoCalls[0]!.frame).toBe(0);
    expect(videoCalls[0]!.timestamp).toBe(0);
  });
});

describe('AVRenderer CompositeState', () => {
  test('every frame yields a valid CompositeState', async () => {
    const renderer = AVRenderer.make({ sampleRate: 48000, fps: 10, durationMs: Millis(200) }, await makeCompositor());

    for await (const f of renderer.frames()) {
      expect(f.state).toBeDefined();
      expect(f.state.discrete).toEqual({});
      expect(f.state.blend).toEqual({});
      expect(f.state.outputs.css).toEqual({});
      expect(f.state.outputs.glsl).toEqual({});
      expect(f.state.outputs.aria).toEqual({});
    }
  });
});

describe('AVRenderer with external bridge', () => {
  test('accepts and uses an existing bridge', async () => {
    const bridge = AVBridge.make({ sampleRate: 48000, fps: 30 });
    const renderer = AVRenderer.make(
      { sampleRate: 48000, fps: 30, durationMs: Millis(100) },
      await makeCompositor(),
      bridge,
    );

    expect(renderer.bridge).toBe(bridge);
    for await (const _ of renderer.frames()) {
    }
    expect(bridge.getCurrentSample()).toBeGreaterThan(0);
  });

  test('does not advance an external bridge that is already ahead of the current frame', async () => {
    const bridge = {
      reset: vi.fn(),
      getCurrentSample: vi.fn(() => 9_999),
      advanceSamples: vi.fn(),
    } as unknown as AVBridge.Shape;

    const renderer = AVRenderer.make(
      { sampleRate: 48_000, fps: 30, durationMs: Millis(10) },
      await makeCompositor(),
      bridge,
    );

    const frames: number[] = [];
    for await (const frame of renderer.frames()) {
      frames.push(frame.sample);
    }

    expect(frames).toEqual([0]);
    expect(bridge.reset).toHaveBeenCalledTimes(1);
    expect(bridge.advanceSamples).not.toHaveBeenCalled();
  });
});
