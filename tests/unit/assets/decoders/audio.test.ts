import { describe, it, expect } from 'vitest';
import { audioDecoder } from '@czap/assets';

/**
 * Build a minimal RIFF/WAVE container around the given fmt/data payloads.
 * Lets us exercise every decodeSamples branch (PCM8/16/24/32 + IEEE float32)
 * without shipping fixture files.
 */
function buildWav(opts: {
  audioFormat: number;
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  byteRate: number;
  blockAlign: number;
  data: Uint8Array;
  /** Optional padding bytes inserted between fmt and data (as a JUNK chunk). */
  preDataPadBytes?: number;
}): Uint8Array {
  const fmtData = new Uint8Array(16);
  const dv = new DataView(fmtData.buffer);
  dv.setUint16(0, opts.audioFormat, true);
  dv.setUint16(2, opts.channels, true);
  dv.setUint32(4, opts.sampleRate, true);
  dv.setUint32(8, opts.byteRate, true);
  dv.setUint16(12, opts.blockAlign, true);
  dv.setUint16(14, opts.bitsPerSample, true);

  const enc = new TextEncoder();
  const fmtChunk = chunk('fmt ', fmtData);
  const dataChunk = chunk('data', opts.data);

  let body: Uint8Array;
  if (opts.preDataPadBytes && opts.preDataPadBytes > 0) {
    const junkChunk = chunk('JUNK', new Uint8Array(opts.preDataPadBytes));
    body = concat(enc.encode('WAVE'), fmtChunk, junkChunk, dataChunk);
  } else {
    body = concat(enc.encode('WAVE'), fmtChunk, dataChunk);
  }
  const riff = concat(enc.encode('RIFF'), u32le(body.byteLength), body);
  return riff;

  function chunk(id: string, payload: Uint8Array): Uint8Array {
    return concat(enc.encode(id), u32le(payload.byteLength), payload);
  }
  function u32le(n: number): Uint8Array {
    const out = new Uint8Array(4);
    new DataView(out.buffer).setUint32(0, n, true);
    return out;
  }
  function concat(...parts: Uint8Array[]): Uint8Array {
    const total = parts.reduce((sum, p) => sum + p.byteLength, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const p of parts) { out.set(p, off); off += p.byteLength; }
    return out;
  }
}

describe('audioDecoder', () => {
  it('decodes a minimal WAV header and returns sample metadata', async () => {
    const bytes = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, // "RIFF"
      0x28, 0x00, 0x00, 0x00, // chunk size
      0x57, 0x41, 0x56, 0x45, // "WAVE"
      0x66, 0x6d, 0x74, 0x20, // "fmt "
      0x10, 0x00, 0x00, 0x00, // subchunk1 size
      0x01, 0x00, 0x01, 0x00, // PCM, mono
      0x80, 0xbb, 0x00, 0x00, // 48000 Hz
      0x00, 0x77, 0x01, 0x00, // byte rate
      0x02, 0x00, 0x10, 0x00, // block align, bits per sample
      0x64, 0x61, 0x74, 0x61, // "data"
      0x04, 0x00, 0x00, 0x00, // data size
      0x00, 0x00, 0x00, 0x00, // 2 silent samples
    ]);
    const decoded = await audioDecoder(bytes.buffer);
    expect(decoded.sampleRate).toBe(48000);
    expect(decoded.channels).toBe(1);
    expect(decoded.bitsPerSample).toBe(16);
    expect(decoded.sampleCount).toBe(2);
    expect(decoded.samples).toBeInstanceOf(Int16Array);
    expect(decoded.durationMs).toBeCloseTo((2 / 48000) * 1000);
  });

  it('throws on missing RIFF magic', async () => {
    const bad = new Uint8Array(44).buffer;
    await expect(audioDecoder(bad)).rejects.toThrow(/RIFF/);
  });

  it('decodes 8-bit PCM into a Float32Array (unsigned, midpoint 128)', async () => {
    const bytes = buildWav({
      audioFormat: 1, channels: 1, sampleRate: 44100, bitsPerSample: 8,
      byteRate: 44100, blockAlign: 1,
      data: new Uint8Array([0, 64, 128, 192, 255]),
    });
    const decoded = await audioDecoder(bytes.buffer);
    expect(decoded.bitsPerSample).toBe(8);
    expect(decoded.samples).toBeInstanceOf(Float32Array);
    expect(decoded.samples.length).toBe(5);
    // Midpoint 128 → 0.0
    expect((decoded.samples as Float32Array)[2]).toBeCloseTo(0);
    // 0 → -1, 255 → ~+0.99
    expect((decoded.samples as Float32Array)[0]).toBeCloseTo(-1);
    expect((decoded.samples as Float32Array)[4]).toBeGreaterThan(0.9);
  });

  it('decodes 24-bit PCM into a normalized Float32Array', async () => {
    // One sample per row: 0x000000 (zero) and 0x7FFFFF (peak +)
    const data = new Uint8Array([0, 0, 0, 0xff, 0xff, 0x7f]);
    const bytes = buildWav({
      audioFormat: 1, channels: 1, sampleRate: 48000, bitsPerSample: 24,
      byteRate: 48000 * 3, blockAlign: 3,
      data,
    });
    const decoded = await audioDecoder(bytes.buffer);
    expect(decoded.bitsPerSample).toBe(24);
    expect(decoded.samples).toBeInstanceOf(Float32Array);
    expect((decoded.samples as Float32Array)[0]).toBe(0);
    expect((decoded.samples as Float32Array)[1]).toBeCloseTo(1, 3);
  });

  it('decodes 32-bit PCM into a normalized Float32Array', async () => {
    // 4-byte little-endian: 0, 0x7fffffff (max positive int32)
    const data = new Uint8Array([
      0, 0, 0, 0,
      0xff, 0xff, 0xff, 0x7f,
    ]);
    const bytes = buildWav({
      audioFormat: 1, channels: 1, sampleRate: 48000, bitsPerSample: 32,
      byteRate: 48000 * 4, blockAlign: 4,
      data,
    });
    const decoded = await audioDecoder(bytes.buffer);
    expect(decoded.bitsPerSample).toBe(32);
    expect(decoded.samples).toBeInstanceOf(Float32Array);
    expect((decoded.samples as Float32Array)[0]).toBe(0);
    expect((decoded.samples as Float32Array)[1]).toBeGreaterThan(0.9);
  });

  it('decodes IEEE float32 (zero-copy view when aligned)', async () => {
    // Two float32 samples: 0.0 and 0.5
    const data = new Uint8Array(8);
    new DataView(data.buffer).setFloat32(0, 0, true);
    new DataView(data.buffer).setFloat32(4, 0.5, true);
    const bytes = buildWav({
      audioFormat: 3, channels: 1, sampleRate: 48000, bitsPerSample: 32,
      byteRate: 48000 * 4, blockAlign: 4,
      data,
    });
    const decoded = await audioDecoder(bytes.buffer);
    expect(decoded.samples).toBeInstanceOf(Float32Array);
    expect((decoded.samples as Float32Array)[0]).toBe(0);
    expect((decoded.samples as Float32Array)[1]).toBeCloseTo(0.5);
  });

  it('decodes IEEE float32 via copy fallback when data offset is not 4-aligned', async () => {
    // Insert a JUNK pad of 2 bytes. RIFF chunk header is 8 bytes; with the
    // 'WAVE' fourcc (4) plus fmt chunk (8 + 16 = 24), the next chunk starts
    // at 4+24 = 28. A JUNK of size 2 (8 + 2 = 10 bytes, padded to even = 10)
    // moves the data chunk to offset 38, payload offset 46 — not 4-aligned.
    const data = new Uint8Array(8);
    new DataView(data.buffer).setFloat32(0, 1, true);
    new DataView(data.buffer).setFloat32(4, -1, true);
    const bytes = buildWav({
      audioFormat: 3, channels: 1, sampleRate: 48000, bitsPerSample: 32,
      byteRate: 48000 * 4, blockAlign: 4,
      data,
      preDataPadBytes: 2,
    });
    const decoded = await audioDecoder(bytes.buffer);
    expect(decoded.samples).toBeInstanceOf(Float32Array);
    expect((decoded.samples as Float32Array)[0]).toBeCloseTo(1);
    expect((decoded.samples as Float32Array)[1]).toBeCloseTo(-1);
  });

  it('throws when fmt chunk is missing', async () => {
    // Build a RIFF/WAVE with only a data chunk (no fmt).
    const enc = new TextEncoder();
    const dataChunk = (() => {
      const id = enc.encode('data');
      const size = new Uint8Array(4);
      new DataView(size.buffer).setUint32(0, 4, true);
      const payload = new Uint8Array(4);
      const out = new Uint8Array(8 + 4);
      out.set(id, 0); out.set(size, 4); out.set(payload, 8);
      return out;
    })();
    const wave = enc.encode('WAVE');
    const body = new Uint8Array(wave.length + dataChunk.length);
    body.set(wave, 0); body.set(dataChunk, wave.length);
    const riff = new Uint8Array(8 + body.length);
    riff.set(enc.encode('RIFF'), 0);
    new DataView(riff.buffer).setUint32(4, body.length, true);
    riff.set(body, 8);
    await expect(audioDecoder(riff.buffer)).rejects.toThrow(/fmt/);
  });

  it('throws when data chunk is missing', async () => {
    // RIFF/WAVE with only an fmt chunk.
    const fmtData = new Uint8Array(16);
    const dv = new DataView(fmtData.buffer);
    dv.setUint16(0, 1, true); dv.setUint16(2, 1, true);
    dv.setUint32(4, 48000, true); dv.setUint32(8, 96000, true);
    dv.setUint16(12, 2, true); dv.setUint16(14, 16, true);
    const enc = new TextEncoder();
    const fmtChunk = (() => {
      const out = new Uint8Array(8 + fmtData.length);
      out.set(enc.encode('fmt '), 0);
      new DataView(out.buffer).setUint32(4, fmtData.length, true);
      out.set(fmtData, 8);
      return out;
    })();
    const wave = enc.encode('WAVE');
    const body = new Uint8Array(wave.length + fmtChunk.length);
    body.set(wave, 0); body.set(fmtChunk, wave.length);
    const riff = new Uint8Array(8 + body.length);
    riff.set(enc.encode('RIFF'), 0);
    new DataView(riff.buffer).setUint32(4, body.length, true);
    riff.set(body, 8);
    await expect(audioDecoder(riff.buffer)).rejects.toThrow(/data/);
  });

  it('throws on unsupported format/bitDepth combination', async () => {
    // PCM at 12 bits is not supported.
    const bytes = buildWav({
      audioFormat: 1, channels: 1, sampleRate: 48000, bitsPerSample: 12,
      byteRate: 72000, blockAlign: 2,
      data: new Uint8Array(4),
    });
    await expect(audioDecoder(bytes.buffer)).rejects.toThrow(/unsupported/);
  });
});
