/**
 * WAV decoder. Walks RIFF chunks (not hardcoded offsets) so ffmpeg's
 * LIST/INFO tag insertions between fmt and data don't corrupt the
 * read. Dispatches on audio format (1=PCM, 3=IEEE float) and
 * bits-per-sample to produce the correct sample TypedArray.
 *
 * @module
 */

import { walkRiff } from './riff.js';

/**
 * Decoded audio metadata + sample buffer.
 *
 * NOTE: for PCM16 and IEEE float32 input, `samples` is a VIEW into the
 * caller's `ArrayBuffer` — no copy is made. Mutating the source buffer
 * (or reusing it in a pooled allocator) mutates samples underneath.
 * For PCM8/24/32, `samples` is a fresh `Float32Array` and is safe to
 * keep independently of the input.
 */
export interface DecodedAudio {
  readonly sampleRate: number;
  readonly channels: number;
  readonly bitsPerSample: number;
  readonly sampleCount: number;
  readonly samples: Int16Array | Float32Array;
  readonly durationMs: number;
}

/** Parse a WAV via RIFF chunk walker and return metadata + sample view. */
export async function audioDecoder(bytes: ArrayBuffer): Promise<DecodedAudio> {
  let fmt: DataView | undefined;
  let data: DataView | undefined;
  for (const chunk of walkRiff(bytes)) {
    if (chunk.id === 'fmt ' && 'data' in chunk) fmt = chunk.data;
    else if (chunk.id === 'data' && 'data' in chunk) data = chunk.data;
  }
  if (!fmt) throw new Error('audioDecoder: missing fmt chunk');
  if (!data) throw new Error('audioDecoder: missing data chunk');

  const audioFormat = fmt.getUint16(0, true);
  const channels = fmt.getUint16(2, true);
  const sampleRate = fmt.getUint32(4, true);
  const bitsPerSample = fmt.getUint16(14, true);

  const samples = decodeSamples(data, audioFormat, bitsPerSample);
  const bytesPerSample = bitsPerSample / 8;
  const frameCount = bytesPerSample > 0 && channels > 0 ? data.byteLength / (channels * bytesPerSample) : 0;
  const durationMs = sampleRate > 0 ? (frameCount / sampleRate) * 1000 : 0;
  // sampleCount = frames per channel (interleaved samples / channels).
  const sampleCount = frameCount;
  return { sampleRate, channels, bitsPerSample, sampleCount, samples, durationMs };
}

function decodeSamples(data: DataView, format: number, bitsPerSample: number): Int16Array | Float32Array {
  // PCM int16 -> Int16Array view (no copy)
  if (format === 1 && bitsPerSample === 16) {
    return new Int16Array(data.buffer, data.byteOffset, data.byteLength / 2);
  }
  // PCM int24 -> Float32 normalized to [-1, 1)
  if (format === 1 && bitsPerSample === 24) {
    const out = new Float32Array(Math.floor(data.byteLength / 3));
    for (let i = 0, j = 0; i + 2 < data.byteLength; i += 3, j++) {
      const b0 = data.getUint8(i);
      const b1 = data.getUint8(i + 1);
      const b2 = data.getInt8(i + 2);
      const v = (b2 << 16) | (b1 << 8) | b0;
      out[j] = v / 0x800000;
    }
    return out;
  }
  // PCM int32 -> Float32 normalized
  if (format === 1 && bitsPerSample === 32) {
    const out = new Float32Array(Math.floor(data.byteLength / 4));
    for (let i = 0, j = 0; i + 3 < data.byteLength; i += 4, j++) {
      out[j] = data.getInt32(i, true) / 0x80000000;
    }
    return out;
  }
  // IEEE float32 -> Float32Array. Prefer a zero-copy view; fall back to a
  // copying decode when data.byteOffset isn't 4-byte aligned (RIFF only
  // guarantees 2-byte alignment, so a preceding LIST/JUNK chunk with
  // size % 4 === 2 can leave us at offset % 4 === 2, which Float32Array
  // refuses).
  if (format === 3 && bitsPerSample === 32) {
    if (data.byteOffset % 4 === 0) {
      return new Float32Array(data.buffer, data.byteOffset, data.byteLength / 4);
    }
    const out = new Float32Array(Math.floor(data.byteLength / 4));
    for (let i = 0, j = 0; i + 3 < data.byteLength; i += 4, j++) {
      out[j] = data.getFloat32(i, true);
    }
    return out;
  }
  // PCM int8 -> Float32 (uncommon but allowed by spec; data is unsigned, midpoint 128)
  if (format === 1 && bitsPerSample === 8) {
    const out = new Float32Array(data.byteLength);
    for (let i = 0; i < data.byteLength; i++) {
      out[i] = (data.getUint8(i) - 128) / 128;
    }
    return out;
  }
  throw new Error(`audioDecoder: unsupported audioFormat=${format} bitsPerSample=${bitsPerSample}`);
}
