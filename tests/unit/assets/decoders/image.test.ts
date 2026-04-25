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
});
