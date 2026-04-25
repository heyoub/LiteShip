/**
 * Tests for WavMetadataProjection / extractWavMetadata. Synthetic WAV
 * buffers exercise INAM (title), IART (artist), and IBPM (custom BPM)
 * tag parsing; an empty-LIST WAV exercises the "no metadata" fallback.
 */

import { describe, it, expect } from 'vitest';
import {
  extractWavMetadata,
  WavMetadataProjection,
} from '@czap/assets';

function writeFourCC(dst: Uint8Array, off: number, cc: string): void {
  if (cc.length !== 4) throw new Error(`fourCC must be 4 chars: ${cc}`);
  for (let i = 0; i < 4; i++) dst[off + i] = cc.charCodeAt(i);
}

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

/** Minimal valid PCM16 mono WAV with optional LIST/INFO between fmt and data. */
function makeWav(tags: ReadonlyArray<[string, string]>): ArrayBuffer {
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

  const blocks: Uint8Array[] = [fmt];

  if (tags.length > 0) {
    const subChunks: Uint8Array[] = [];
    for (const [id, value] of tags) {
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
    blocks.push(list);
  }

  const dataPayload = new Uint8Array(4);
  const dataChunk = new Uint8Array(8 + dataPayload.byteLength);
  writeFourCC(dataChunk, 0, 'data');
  new DataView(dataChunk.buffer).setUint32(4, dataPayload.byteLength, true);
  blocks.push(dataChunk);

  const body = concat(blocks);
  const riff = new Uint8Array(12 + body.byteLength);
  writeFourCC(riff, 0, 'RIFF');
  new DataView(riff.buffer).setUint32(4, 4 + body.byteLength, true);
  writeFourCC(riff, 8, 'WAVE');
  riff.set(new Uint8Array(body), 12);
  return riff.buffer;
}

describe('extractWavMetadata', () => {
  it('reads INAM and IART tags from LIST/INFO', () => {
    const buf = makeWav([
      ['INAM', 'My Song'],
      ['IART', 'Some Artist'],
    ]);
    const meta = extractWavMetadata(buf);
    expect(meta.title).toBe('My Song');
    expect(meta.artist).toBe('Some Artist');
  });

  it('reads IBPM custom tag as a number', () => {
    const buf = makeWav([['IBPM', '128']]);
    const meta = extractWavMetadata(buf);
    expect(meta.bpm).toBe(128);
  });

  it('ignores unknown tags', () => {
    const buf = makeWav([
      ['INAM', 'X'],
      ['IXXX', 'ignored'],
    ]);
    const meta = extractWavMetadata(buf);
    expect(meta.title).toBe('X');
    expect(Object.keys(meta).sort()).toEqual(['title']);
  });

  it('returns an empty object when no LIST/INFO chunk is present', () => {
    const buf = makeWav([]);
    const meta = extractWavMetadata(buf);
    expect(meta).toEqual({});
  });

  it('discards an IBPM that fails to parse as a finite positive number', () => {
    const buf = makeWav([['IBPM', 'not-a-number']]);
    const meta = extractWavMetadata(buf);
    expect(meta.bpm).toBeUndefined();
  });

  it('handles an odd-length tag value (RIFF 2-byte alignment)', () => {
    // 'A' (1 byte) + null terminator (1 byte) = 2 bytes. Use an odd-text-len
    // case: 'AB' + null = 3 bytes, padded to 4 by the encoder.
    const buf = makeWav([['INAM', 'AB']]);
    const meta = extractWavMetadata(buf);
    expect(meta.title).toBe('AB');
  });
});

describe('WavMetadataProjection', () => {
  it('emits a cachedProjection capsule named <id>:wav-metadata', () => {
    const cap = WavMetadataProjection('intro-bed');
    expect(cap._kind).toBe('cachedProjection');
    expect(cap.name).toBe('intro-bed:wav-metadata');
  });

  it('declares an asset:<id> read capability', () => {
    const cap = WavMetadataProjection('test-asset');
    expect(cap.capabilities.reads).toContain('asset:test-asset');
    expect(cap.capabilities.writes).toEqual([]);
  });

  it('runs invariants against valid + invalid metadata shapes', () => {
    const cap = WavMetadataProjection('intro-bed');
    const inv = cap.invariants;
    const shapeInv = inv.find((i) => i.name === 'output-shape');
    const bpmInv = inv.find((i) => i.name === 'bpm-in-range');
    expect(shapeInv?.check(undefined, {})).toBe(true);
    expect(shapeInv?.check(undefined, null)).toBe(false);
    expect(bpmInv?.check(undefined, { bpm: 128 })).toBe(true);
    expect(bpmInv?.check(undefined, { bpm: 0 })).toBe(false);
    expect(bpmInv?.check(undefined, { bpm: 9999 })).toBe(false);
    expect(bpmInv?.check(undefined, {})).toBe(true);
  });
});
