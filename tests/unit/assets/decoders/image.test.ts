import { describe, it, expect } from 'vitest';
import { imageDecoder } from '@czap/assets';

describe('imageDecoder', () => {
  it('reads PNG dimensions from IHDR', async () => {
    const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
    const img = await imageDecoder(bytes);
    expect(img.format).toBe('png');
    expect(img.width).toBe(1);
    expect(img.height).toBe(1);
  });

  it('reads JPEG SOF0 dimensions', async () => {
    const jpegFixture = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00,
      0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x64, 0x00, 0xc8,
    ]).buffer;
    const img = await imageDecoder(jpegFixture);
    expect(img.format).toBe('jpeg');
    expect(img.height).toBe(100);
    expect(img.width).toBe(200);
  });

  it('returns "unknown" format for unrecognized bytes', async () => {
    const bytes = new Uint8Array(32).buffer; // all zeros
    const img = await imageDecoder(bytes);
    expect(img.format).toBe('unknown');
    expect(img.width).toBe(0);
    expect(img.height).toBe(0);
  });

  it('handles JPEG with a leading APP segment that segment-jumps past it', async () => {
    // SOI 0xFFD8, APP0 0xFFE0 segLen 16 (10 + 6 padding), then SOF0 with
    // dims 256x128. The scanner must follow the segment-length jump from
    // APP0 → SOF0 rather than the byte-by-byte fallback.
    const fixture = new Uint8Array([
      0xff, 0xd8,
      0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
      0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x80, 0x01, 0x00,
    ]).buffer;
    const img = await imageDecoder(fixture);
    expect(img.format).toBe('jpeg');
    expect(img.height).toBe(128);
    expect(img.width).toBe(256);
  });

  it('emits zero dimensions for a JPEG missing the SOF marker', async () => {
    // SOI then a single APP segment, no SOF — the scan should fall through.
    const fixture = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x06, 0x00, 0x00, 0xff, 0xff,
    ]).buffer;
    const img = await imageDecoder(fixture);
    expect(img.format).toBe('jpeg');
    expect(img.width).toBe(0);
    expect(img.height).toBe(0);
  });

  it('returns unknown for buffers shorter than the PNG/JPEG magic', async () => {
    const tiny = new Uint8Array(2).buffer;
    const img = await imageDecoder(tiny);
    expect(img.format).toBe('unknown');
  });
});
