/**
 * Re-exports of the Mediabunny classes used by the video capture
 * pipeline.
 *
 * Centralising these imports in a single shim gives the pipeline a
 * stable surface we can mock in tests and swap for alternative encoders
 * without touching every call site.
 *
 * @module
 */
import {
  BufferTarget as BufferTargetImpl,
  EncodedPacket as EncodedPacketImpl,
  EncodedVideoPacketSource as EncodedVideoPacketSourceImpl,
  Mp4OutputFormat as Mp4OutputFormatImpl,
  Output as OutputImpl,
} from 'mediabunny';
import type {
  BufferTarget as BufferTargetShape,
  EncodedPacket as EncodedPacketShape,
  EncodedVideoPacketSource as EncodedVideoPacketSourceShape,
  Mp4OutputFormat as Mp4OutputFormatShape,
  Output as OutputShape,
} from 'mediabunny';

/** Re-export of Mediabunny's `BufferTarget` sink class. */
export const BufferTarget = BufferTargetImpl;
/** Re-export of Mediabunny's `EncodedPacket` value class. */
export const EncodedPacket = EncodedPacketImpl;
/** Re-export of Mediabunny's `EncodedVideoPacketSource`. */
export const EncodedVideoPacketSource = EncodedVideoPacketSourceImpl;
/** Re-export of Mediabunny's `Mp4OutputFormat`. */
export const Mp4OutputFormat = Mp4OutputFormatImpl;
/** Re-export of Mediabunny's `Output` pipeline head class. */
export const Output = OutputImpl;

/** Structural type of {@link BufferTarget}. */
export type BufferTarget = BufferTargetShape;
/** Structural type of {@link EncodedPacket}. */
export type EncodedPacket = EncodedPacketShape;
/** Structural type of {@link EncodedVideoPacketSource}. */
export type EncodedVideoPacketSource = EncodedVideoPacketSourceShape;
/** Structural type of {@link Mp4OutputFormat}. */
export type Mp4OutputFormat = Mp4OutputFormatShape;
/** Structural type of {@link Output}. */
export type Output = OutputShape;
