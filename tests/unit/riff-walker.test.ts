/**
 * Tests for the RIFF chunk walker. Synthetic WAV buffers verify chunk
 * dispatch (RIFF header, fmt, LIST/INFO, data); the real
 * examples/scenes/intro-bed.wav fixture verifies that ffmpeg-emitted
 * LIST/INFO chunks between fmt and data don't break the walk.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { walkRiff, type WavChunk } from '@czap/assets';

/** Encode an ASCII fourCC into a 4-byte slice at `dst[off..off+4]`. */
function writeFourCC(dst: Uint8Array, off: number, cc: string): void {
  if (cc.length !== 4) throw new Error(`fourCC must be 4 chars: ${cc}`);
  for (let i = 0; i < 4; i++) dst[off + i] = cc.charCodeAt(i);
}

/** Concatenate Uint8Arrays into a single ArrayBuffer. */
function concat(parts: readonly Uint8Array[]): ArrayBuffer {
  const total = parts.reduce((s, p) => s + p.byteLength, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.byteLength;
  }
  return out.buffer;
}

/** Build a minimal valid PCM16 mono WAV with 4 bytes (2 samples) of silence. */
function makeMinimalWav(): ArrayBuffer {
  const fmt = new Uint8Array(8 + 16);
  writeFourCC(fmt, 0, 'fmt ');
  new DataView(fmt.buffer).setUint32(4, 16, true);
  const fmtBody = new DataView(fmt.buffer, 8, 16);
  fmtBody.setUint16(0, 1, true);     // PCM
  fmtBody.setUint16(2, 1, true);     // mono
  fmtBody.setUint32(4, 48000, true); // sample rate
  fmtBody.setUint32(8, 96000, true); // byte rate
  fmtBody.setUint16(12, 2, true);    // block align
  fmtBody.setUint16(14, 16, true);   // bits per sample

  const dataPayload = new Uint8Array(4); // 4 bytes = 2 PCM16 samples (zeros)
  const dataChunk = new Uint8Array(8 + dataPayload.byteLength);
  writeFourCC(dataChunk, 0, 'data');
  new DataView(dataChunk.buffer).setUint32(4, dataPayload.byteLength, true);
  dataChunk.set(dataPayload, 8);

  const body = concat([fmt, dataChunk]);
  const riff = new Uint8Array(12 + body.byteLength);
  writeFourCC(riff, 0, 'RIFF');
  new DataView(riff.buffer).setUint32(4, 4 + body.byteLength, true); // size minus first 8
  writeFourCC(riff, 8, 'WAVE');
  riff.set(new Uint8Array(body), 12);
  return riff.buffer;
}

/**
 * Build a WAV with a LIST/INFO chunk between fmt and data.
 * Each tag is encoded as [4-byte id][uint32 size][text bytes, null-padded to even length].
 */
function makeWavWithListInfo(tags: ReadonlyArray<[string, string]>): ArrayBuffer {
  const fmt = new Uint8Array(8 + 16);
  writeFourCC(fmt, 0, 'fmt ');
  new DataView(fmt.buffer).setUint32(4, 16, true);
  const fmtBody = new DataView(fmt.buffer, 8, 16);
  fmtBody.setUint16(0, 1, true);
  fmtBody.setUint16(2, 1, true);
  fmtBody.setUint32(4, 48000, true);
  fmtBody.setUint32(8, 96000, true);
  fmtBody.setUint16(12, 2, true);
  fmtBody.setUint16(14, 16, true);

  // Build LIST payload: 'INFO' + each sub-chunk.
  const subChunks: Uint8Array[] = [];
  for (const [id, value] of tags) {
    // Null-terminate and pad to even length per RIFF convention.
    const textBytes = new TextEncoder().encode(value + '\0');
    const padded = textBytes.byteLength % 2 === 0
      ? textBytes
      : (() => {
          const p = new Uint8Array(textBytes.byteLength + 1);
          p.set(textBytes);
          return p;
        })();
    const sub = new Uint8Array(8 + padded.byteLength);
    writeFourCC(sub, 0, id);
    new DataView(sub.buffer).setUint32(4, textBytes.byteLength, true);
    sub.set(padded, 8);
    subChunks.push(sub);
  }
  const subTotal = subChunks.reduce((s, p) => s + p.byteLength, 0);
  const listPayload = new Uint8Array(4 + subTotal);
  writeFourCC(listPayload, 0, 'INFO');
  let off = 4;
  for (const s of subChunks) {
    listPayload.set(s, off);
    off += s.byteLength;
  }
  const list = new Uint8Array(8 + listPayload.byteLength);
  writeFourCC(list, 0, 'LIST');
  new DataView(list.buffer).setUint32(4, listPayload.byteLength, true);
  list.set(listPayload, 8);

  const dataPayload = new Uint8Array(4);
  const dataChunk = new Uint8Array(8 + dataPayload.byteLength);
  writeFourCC(dataChunk, 0, 'data');
  new DataView(dataChunk.buffer).setUint32(4, dataPayload.byteLength, true);

  const body = concat([fmt, list, dataChunk]);
  const riff = new Uint8Array(12 + body.byteLength);
  writeFourCC(riff, 0, 'RIFF');
  new DataView(riff.buffer).setUint32(4, 4 + body.byteLength, true);
  writeFourCC(riff, 8, 'WAVE');
  riff.set(new Uint8Array(body), 12);
  return riff.buffer;
}

describe('walkRiff', () => {
  it('rejects buffers smaller than the 12-byte RIFF header', () => {
    const buf = new Uint8Array(4).buffer;
    expect(() => [...walkRiff(buf)]).toThrow(/too small/);
  });

  it('rejects non-RIFF buffers', () => {
    const buf = new Uint8Array(16).buffer;
    expect(() => [...walkRiff(buf)]).toThrow(/RIFF/);
  });

  it('walks a minimal WAV: RIFF, fmt, data', () => {
    const buf = makeMinimalWav();
    const chunks = [...walkRiff(buf)];
    expect(chunks[0]?.id).toBe('RIFF');
    expect((chunks[0] as Extract<WavChunk, { id: 'RIFF' }>).formType).toBe('WAVE');
    const ids = chunks.map((c) => c.id);
    expect(ids).toContain('fmt ');
    expect(ids).toContain('data');
  });

  it('walks a WAV with LIST/INFO between fmt and data', () => {
    const buf = makeWavWithListInfo([
      ['INAM', 'My Song'],
      ['IART', 'The Artist'],
    ]);
    const chunks = [...walkRiff(buf)];
    const ids = chunks.map((c) => c.id);
    expect(ids).toEqual(['RIFF', 'fmt ', 'LIST', 'data']);
    const list = chunks.find((c): c is Extract<WavChunk, { id: 'LIST' }> => c.id === 'LIST');
    expect(list).toBeDefined();
    expect(list?.listType).toBe('INFO');
  });

  it('throws on a chunk that overruns the buffer', () => {
    // Build a RIFF header followed by a chunk that claims more bytes
    // than the buffer can possibly hold.
    const buf = new Uint8Array(20);
    writeFourCC(buf, 0, 'RIFF');
    new DataView(buf.buffer).setUint32(4, 12, true);
    writeFourCC(buf, 8, 'WAVE');
    writeFourCC(buf, 12, 'fmt ');
    new DataView(buf.buffer).setUint32(16, 0xffffff, true);
    expect(() => [...walkRiff(buf.buffer)]).toThrow(/RIFF chunk fmt /);
  });

  it('decodes the shipped intro-bed.wav fixture cleanly', () => {
    const path = resolve('examples/scenes/intro-bed.wav');
    if (!existsSync(path)) {
      // fixture not present in this checkout — skip rather than fail
      return;
    }
    const buf = readFileSync(path);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const chunks = [...walkRiff(ab as ArrayBuffer)];
    expect(chunks[0]?.id).toBe('RIFF');
    expect((chunks[0] as Extract<WavChunk, { id: 'RIFF' }>).formType).toBe('WAVE');
    const ids = chunks.map((c) => c.id);
    expect(ids).toContain('fmt ');
    expect(ids).toContain('data');
  });
});
