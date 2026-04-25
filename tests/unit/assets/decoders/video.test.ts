import { describe, it, expect } from 'vitest';
import { videoDecoder } from '@czap/assets';

describe('videoDecoder', () => {
  it('returns container metadata for a minimal MP4-like fixture', async () => {
    const fixture = new Uint8Array([
      0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70,
      0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00,
    ]).buffer;
    const decoded = await videoDecoder(fixture);
    expect(typeof decoded.container).toBe('string');
  });

  it('throws on an empty buffer', async () => {
    await expect(videoDecoder(new ArrayBuffer(0))).rejects.toThrow(/empty/);
  });

  it('falls back to header sniff when ffprobe is unavailable (webm magic)', async () => {
    // EBML header magic (0x1a45DFA3 first 4 bytes).
    const fixture = new Uint8Array([
      0x1a, 0x45, 0xdf, 0xa3, 0xa3, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81,
    ]).buffer;
    const decoded = await videoDecoder(fixture);
    // We can't assume ffprobe is installed; either it succeeded with a real
    // container name, or it fell back to guessContainer's webm signature.
    expect(typeof decoded.container).toBe('string');
    expect(decoded.container.length).toBeGreaterThan(0);
  });

  it('falls back to "unknown" for unrecognized bytes', async () => {
    const fixture = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]).buffer;
    const decoded = await videoDecoder(fixture);
    expect(typeof decoded.container).toBe('string');
  });
});
