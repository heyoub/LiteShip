/**
 * Image decoder — reads format + dimensions from header bytes.
 * PNG IHDR at offset 16; JPEG SOF0 scan.
 *
 * @module
 */

/** Decoded image format + dimensions. */
export interface DecodedImage {
  readonly format: 'png' | 'jpeg' | 'webp' | 'unknown';
  readonly width: number;
  readonly height: number;
}

/** Probe an image buffer for format and dimensions. */
export async function imageDecoder(bytes: ArrayBuffer): Promise<DecodedImage> {
  const view = new DataView(bytes);
  if (view.byteLength >= 24 && view.getUint32(0) === 0x89504e47) {
    return { format: 'png', width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (view.byteLength >= 4 && view.getUint16(0) === 0xffd8) {
    return scanJpeg(view);
  }
  return { format: 'unknown', width: 0, height: 0 };
}

function scanJpeg(view: DataView): DecodedImage {
  let off = 2;
  while (off < view.byteLength - 8) {
    if (view.getUint8(off) !== 0xff) { off++; continue; }
    const marker = view.getUint8(off + 1);
    if (marker >= 0xc0 && marker <= 0xc2) {
      const height = view.getUint16(off + 5);
      const width = view.getUint16(off + 7);
      return { format: 'jpeg', width, height };
    }
    // Jump by segment length, but only if the segment fits within the buffer;
    // truncated fixtures (e.g. minimal test fixtures) fall back to byte scan.
    if (off + 3 < view.byteLength) {
      const segLen = view.getUint16(off + 2);
      const next = off + 2 + segLen;
      if (next < view.byteLength) {
        off = next;
        continue;
      }
    }
    off++;
  }
  return { format: 'jpeg', width: 0, height: 0 };
}
