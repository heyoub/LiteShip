/**
 * WebCodecs capture -- browser-native video encoding to MP4 via mediabunny.
 *
 * Implements the FrameCapture contract using the WebCodecs API
 * with proper ISO BMFF (MP4) muxing for playable output.
 *
 * @module
 */

import type { CaptureConfig, CaptureFrame, FrameCapture, CaptureResult } from '@czap/core';
import { CAPTURE_KEYFRAME_INTERVAL, Millis } from '@czap/core';
import { BufferTarget, EncodedPacket, EncodedVideoPacketSource, Mp4OutputFormat, Output } from './mediabunny.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Options for {@link WebCodecsCapture.make}. All fields are optional;
 * omitted values fall back to Baseline H.264 at 4 Mbps.
 */
export interface WebCodecsCaptureOptions {
  /** Video codec string. Default: 'avc1.42001E' (H.264 Baseline Level 3.0) */
  readonly codec?: string;
  /** Target bitrate in bits/second. Default: 4_000_000 */
  readonly bitrate?: number;
  /** Keyframe interval in frames. Default: 30 */
  readonly keyframeInterval?: number;
}

// ---------------------------------------------------------------------------
// Codec mapping: WebCodecs string -> mediabunny short name
// ---------------------------------------------------------------------------

function toMediabunnyCodec(webCodecsCodec: string): 'avc' | 'hevc' | 'vp9' | 'av1' {
  if (webCodecsCodec.startsWith('avc')) return 'avc';
  if (webCodecsCodec.startsWith('hvc') || webCodecsCodec.startsWith('hev')) return 'hevc';
  if (webCodecsCodec.startsWith('vp09') || webCodecsCodec.startsWith('vp9')) return 'vp9';
  if (webCodecsCodec.startsWith('av01') || webCodecsCodec.startsWith('av1')) return 'av1';
  throw new Error(`Unsupported WebCodecs codec "${webCodecsCodec}"`);
}

function requiresEvenDimensions(webCodecsCodec: string): boolean {
  return webCodecsCodec.startsWith('avc') || webCodecsCodec.startsWith('hvc') || webCodecsCodec.startsWith('hev');
}

function normalizeTimestampUs(timestampMs: number, fps: number, previousTimestampUs: number): number {
  const frameDurationUs = Math.max(1, Math.round(1_000_000 / fps));
  const requestedTimestampUs = Number.isFinite(timestampMs)
    ? Math.max(0, Math.round(timestampMs * 1000))
    : previousTimestampUs + frameDurationUs;

  if (previousTimestampUs < 0) {
    return requestedTimestampUs;
  }

  return Math.max(previousTimestampUs + 1, requestedTimestampUs);
}

function supportErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

function make(options?: WebCodecsCaptureOptions): FrameCapture {
  const codec = options?.codec ?? 'avc1.42001E';
  const bitrate = options?.bitrate ?? 4_000_000;
  const keyframeInterval = options?.keyframeInterval ?? CAPTURE_KEYFRAME_INTERVAL;

  let encoder: VideoEncoder | null = null;
  let frameCount = 0;
  let config: CaptureConfig | null = null;
  let videoSource: EncodedVideoPacketSource | null = null;
  let output: Output | null = null;
  let target: BufferTarget | null = null;
  let packetQueue: Array<{ packet: EncodedPacket; metadata?: EncodedVideoChunkMetadata }> = [];
  let pendingError: Error | null = null;
  let lastTimestampUs = -1;

  function assertHealthy(): void {
    if (pendingError) {
      throw pendingError;
    }
  }

  function resetState(): void {
    encoder = null;
    config = null;
    videoSource = null;
    output = null;
    target = null;
    packetQueue = [];
    pendingError = null;
    lastTimestampUs = -1;
  }

  return {
    _tag: 'FrameCapture',

    async init(captureConfig: CaptureConfig): Promise<void> {
      if (typeof VideoEncoder === 'undefined') {
        throw new Error('WebCodecs VideoEncoder is unavailable in this environment');
      }

      if (requiresEvenDimensions(codec) && (captureConfig.width % 2 !== 0 || captureConfig.height % 2 !== 0)) {
        throw new Error(
          `Codec "${codec}" requires even dimensions. Got ${captureConfig.width}x${captureConfig.height}`,
        );
      }

      const encoderConfig = {
        codec,
        width: captureConfig.width,
        height: captureConfig.height,
        bitrate,
        framerate: captureConfig.fps,
      } satisfies VideoEncoderConfig;

      if (typeof VideoEncoder.isConfigSupported === 'function') {
        let support: VideoEncoderSupport;
        try {
          support = await VideoEncoder.isConfigSupported(encoderConfig);
        } catch (err) {
          throw new Error(`VideoEncoder support probe failed: ${supportErrorMessage(err)}`);
        }

        if (!support.supported) {
          throw new Error(
            `VideoEncoder does not support codec "${codec}" at ${captureConfig.width}x${captureConfig.height}@${captureConfig.fps}`,
          );
        }
      }

      config = captureConfig;
      frameCount = 0;
      packetQueue = [];
      pendingError = null;
      lastTimestampUs = -1;

      videoSource = new EncodedVideoPacketSource(toMediabunnyCodec(codec));
      target = new BufferTarget();
      output = new Output({
        format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
        target,
      });
      output.addVideoTrack(videoSource, { frameRate: captureConfig.fps });
      await output.start();

      encoder = new VideoEncoder({
        output(chunk: EncodedVideoChunk, metadata?: EncodedVideoChunkMetadata) {
          packetQueue.push({ packet: EncodedPacket.fromEncodedChunk(chunk), metadata });
        },
        error(err: DOMException) {
          pendingError = new Error(`VideoEncoder error: ${err.message}`);
        },
      });

      encoder.configure(encoderConfig);
    },

    async capture(frame: CaptureFrame): Promise<void> {
      if (!encoder || !config) {
        throw new Error('FrameCapture not initialized. Call init() first.');
      }

      assertHealthy();

      const normalizedTimestampUs = normalizeTimestampUs(frame.timestamp, config.fps, lastTimestampUs);
      lastTimestampUs = normalizedTimestampUs;

      const videoFrame = new VideoFrame(frame.bitmap, {
        timestamp: normalizedTimestampUs,
        duration: 1_000_000 / config.fps,
      });

      const isKeyFrame = frameCount % keyframeInterval === 0;
      try {
        encoder.encode(videoFrame, { keyFrame: isKeyFrame });
        frameCount++;
      } finally {
        videoFrame.close();
      }

      assertHealthy();
    },

    async finalize(): Promise<CaptureResult> {
      if (!encoder || !config || !videoSource || !output || !target) {
        throw new Error('FrameCapture not initialized. Call init() first.');
      }

      if (frameCount === 0) {
        throw new Error('FrameCapture has no frames to finalize');
      }

      await encoder.flush();
      assertHealthy();
      encoder.close();

      if (packetQueue.length === 0) {
        throw new Error('VideoEncoder produced no packets');
      }

      for (const entry of packetQueue) {
        if (entry.metadata) {
          await videoSource.add(entry.packet, entry.metadata);
        } else {
          await videoSource.add(entry.packet);
        }
      }
      packetQueue = [];

      await output.finalize();

      const buffer = target.buffer;
      if (!buffer || buffer.byteLength === 0) {
        throw new Error('MP4 muxer produced no output');
      }

      const result: CaptureResult = {
        blob: new Blob([buffer], { type: 'video/mp4' }),
        codec,
        frames: frameCount,
        durationMs: Millis((frameCount / config.fps) * 1000),
      };

      resetState();
      return result;
    },
  };
}

/**
 * WebCodecsCapture -- module object + namespace for browser-native video capture.
 */
export const WebCodecsCapture = { make } as const;

export declare namespace WebCodecsCapture {
  /** Structural type of a frame-capture surface. */
  export type Shape = FrameCapture;
}
