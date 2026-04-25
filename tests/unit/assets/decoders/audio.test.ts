import { describe, it, expect } from 'vitest';
import { audioDecoder } from '@czap/assets';

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
  });

  it('throws on missing RIFF magic', async () => {
    const bad = new Uint8Array(44).buffer;
    await expect(audioDecoder(bad)).rejects.toThrow(/RIFF/);
  });
});
