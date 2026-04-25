/**
 * AVRenderer -- deterministic offline A/V renderer.
 *
 * Steps through audio samples and visual frames in lockstep.
 * Each video frame knows its exact audio position. No wall-clock
 * dependency -- fully deterministic.
 *
 * @module
 */

import type { CompositeState } from './compositor.js';
import type { Compositor } from './compositor.js';
import { AVBridge } from './av-bridge.js';
import type { Millis } from './brands.js';
import { Effect } from 'effect';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AVRenderConfig {
  readonly sampleRate: number;
  readonly fps: number;
  readonly durationMs: Millis;
}

interface AVFrameOutput {
  readonly frame: number;
  readonly timestamp: number;
  readonly sample: number;
  readonly sampleCount: number;
  readonly state: CompositeState;
}

interface AVRendererShape {
  readonly config: AVRenderConfig;
  readonly bridge: AVBridge.Shape;
  readonly totalFrames: number;
  frames(options?: {
    onAudioFrame?: (sample: number, sampleCount: number) => void;
    onVideoFrame?: (frame: number, timestamp: number, state: CompositeState) => void;
  }): AsyncGenerator<AVFrameOutput>;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

function _make(config: AVRenderConfig, compositor: Compositor.Shape, existingBridge?: AVBridge.Shape): AVRendererShape {
  const { sampleRate, fps, durationMs } = config;
  const totalFrames = Math.ceil((durationMs / 1000) * fps);
  const samplesPerFrame = Math.round(sampleRate / fps);

  const bridge = existingBridge ?? AVBridge.make({ sampleRate, fps });
  bridge.reset();

  return {
    config,
    bridge,
    totalFrames,

    async *frames(options) {
      const { onAudioFrame, onVideoFrame } = options ?? {};

      for (let i = 0; i < totalFrames; i++) {
        const targetSample = (i + 1) * samplesPerFrame;
        const currentSample = bridge.getCurrentSample();
        const advance = targetSample - currentSample;

        if (advance > 0) {
          bridge.advanceSamples(advance);
        }

        const frameSample = i * samplesPerFrame;
        const timestamp = (i * 1000) / fps;

        if (onAudioFrame) {
          onAudioFrame(frameSample, samplesPerFrame);
        }

        const state = await Effect.runPromise(compositor.compute());

        if (onVideoFrame) {
          onVideoFrame(i, timestamp, state);
        }

        yield {
          frame: i,
          timestamp,
          sample: frameSample,
          sampleCount: samplesPerFrame,
          state,
        };
      }
    },
  };
}

/**
 * AVRenderer — deterministic offline audio+video renderer.
 *
 * Steps an {@link AVBridge} in lockstep with a {@link Compositor} so every
 * video frame carries the exact sample offset it corresponds to. Pure clock
 * math — no wall-clock input, reproducible across runs.
 */
export const AVRenderer = {
  /** Create a renderer bound to a compositor, optionally reusing an existing {@link AVBridge}. */
  make: _make,
};

export declare namespace AVRenderer {
  /** Structural shape of a renderer instance returned by {@link AVRenderer.make}. */
  export type Shape = AVRendererShape;
  /** Configuration accepted by {@link AVRenderer.make}. */
  export type Config = AVRenderConfig;
  /** Per-frame output yielded by the async iterator. */
  export type FrameOutput = AVFrameOutput;
}
