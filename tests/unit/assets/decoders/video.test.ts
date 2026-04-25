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
});
