/**
 * Demo setup -- boundary definition, compositor wiring, frame precomputation.
 *
 * Defines a 3-state "scale" boundary (small -> medium -> large) that drives
 * CSS custom properties for scale transform, background color, and foreground color.
 * The boundary is driven by a normalized 0-100 progress signal where
 * thresholds fire at 0, 33, and 66.
 *
 * @module
 */

import { Effect, Scope } from 'effect';
import { Boundary, Compositor, VideoRenderer } from '@czap/core';
import type { VideoFrameOutput } from '@czap/core';
import { Q } from '@czap/quantizer';
import { precomputeFrames } from '@czap/remotion';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const FPS = 30;
export const DURATION_MS = 3000;
export const WIDTH = 1280;
export const HEIGHT = 720;

// ---------------------------------------------------------------------------
// Boundary: 3-state scale with thresholds at 0, 33, 66 (normalized 0-100)
// ---------------------------------------------------------------------------

const scaleBoundary = Boundary.make({
  input: 'progress',
  at: [
    [0, 'small'],
    [33, 'medium'],
    [66, 'large'],
  ] as const,
});

// ---------------------------------------------------------------------------
// Quantizer config: CSS outputs per state
// ---------------------------------------------------------------------------

const scaleQuantizerConfig = Q.from(scaleBoundary).outputs({
  css: {
    small: { '--scale': 0.5, '--bg': '#1a1a2e', '--fg': '#ffffff' },
    medium: { '--scale': 1.0, '--bg': '#16213e', '--fg': '#ffffff' },
    large: { '--scale': 1.5, '--bg': '#0f3460', '--fg': '#ffffff' },
  },
});

// ---------------------------------------------------------------------------
// buildFrames -- create compositor, add quantizer, precompute all frames
// ---------------------------------------------------------------------------

export async function buildFrames(): Promise<ReadonlyArray<VideoFrameOutput>> {
  const totalFrames = Math.ceil((DURATION_MS / 1000) * FPS);

  // Run the Effect pipeline: create compositor + quantizer in a managed scope
  const compositor = Effect.runSync(Effect.scoped(Compositor.create()));

  // Create the live quantizer in a scope
  const quantizer = Effect.runSync(Effect.scoped(scaleQuantizerConfig.create()));

  // Add quantizer to compositor under the name "scale"
  Effect.runSync(compositor.add('scale', quantizer));

  // Create the VideoRenderer
  const renderer = VideoRenderer.make({ fps: FPS, width: WIDTH, height: HEIGHT, durationMs: DURATION_MS }, compositor);

  // Drive the quantizer through the progress range (0-100) across frames
  // so each frame evaluates the boundary at the correct progress value
  const frames: VideoFrameOutput[] = [];
  for await (const frame of renderer.frames()) {
    // Map frame progress (0..1) -> boundary input range (0..100)
    const progressValue = frame.progress * 100;
    quantizer.evaluate(progressValue);

    // Recompute compositor state after quantizer evaluation
    const state = Effect.runSync(compositor.compute());
    frames.push({
      frame: frame.frame,
      timestamp: frame.timestamp,
      progress: frame.progress,
      state,
    });
  }

  return frames;
}
