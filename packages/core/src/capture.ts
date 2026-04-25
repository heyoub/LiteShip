/**
 * Capture types -- the contract between frame rendering and video encoding.
 *
 * `FrameCapture` is the abstraction that both WebCodecs and Remotion
 * implement. VideoRenderer produces frames, FrameCapture consumes them.
 *
 * @module
 */

import type { Millis } from './brands.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Encoder-facing configuration: target resolution and frame rate. */
export interface CaptureConfig {
  readonly width: number;
  readonly height: number;
  readonly fps: number;
}

/** Single pre-rendered frame handed to a {@link FrameCapture} — frame number, timestamp, and pixel source. */
export interface CaptureFrame {
  readonly frame: number;
  readonly timestamp: number;
  readonly bitmap: ImageBitmap | OffscreenCanvas;
}

/**
 * Minimal encoder contract: `init` to open the encoder, `capture` per frame,
 * `finalize` to flush and return the encoded blob. Implemented by `@czap/web`
 * (WebCodecs) and `@czap/remotion` (Remotion capture).
 */
export interface FrameCapture {
  readonly _tag: 'FrameCapture';
  init(config: CaptureConfig): Promise<void>;
  capture(frame: CaptureFrame): Promise<void>;
  finalize(): Promise<CaptureResult>;
}

/** Encoder output returned from {@link FrameCapture}.`finalize`: the encoded blob plus codec metadata. */
export interface CaptureResult {
  readonly blob: Blob;
  readonly codec: string;
  readonly frames: number;
  readonly durationMs: Millis;
}
