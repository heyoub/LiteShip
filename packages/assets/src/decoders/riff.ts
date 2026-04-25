/**
 * RIFF container walker. The RIFF format is a 12-byte header
 * ('RIFF' | size | formType) followed by a sequence of chunks:
 * each chunk is [fourCC id] [uint32 size] [size bytes payload]
 * with 2-byte alignment padding between chunks.
 *
 * Supports the WAV subset used by @czap/assets: 'fmt ', 'data', 'LIST'
 * (typed by listType), and unknown passthrough chunks that we preserve
 * for metadata projections.
 *
 * @module
 */

/** Four-character code, e.g. 'RIFF', 'fmt ', 'data', 'LIST', 'INFO'. */
export type FourCC = string;

/** Single yielded chunk from {@link walkRiff}. */
export type WavChunk =
  | {
      readonly id: 'RIFF';
      readonly size: number;
      readonly formType: FourCC;
      readonly offset: number;
    }
  | {
      readonly id: 'LIST';
      readonly size: number;
      readonly offset: number;
      readonly listType: FourCC;
      readonly data: DataView;
    }
  | {
      readonly id: FourCC;
      readonly size: number;
      readonly offset: number;
      readonly data: DataView;
    };

/**
 * Iterate over every chunk in a RIFF buffer. The first yielded value is
 * always the RIFF header; subsequent yields are top-level chunks in the
 * order they appear. LIST chunks carry their listType so callers can
 * dispatch (e.g. LIST/INFO for tag metadata).
 *
 * Throws RangeError if the buffer is too small or a chunk overruns the
 * buffer; throws Error for non-RIFF magic.
 */
export function* walkRiff(buffer: ArrayBuffer): Generator<WavChunk> {
  if (buffer.byteLength < 12) throw new RangeError('RIFF buffer too small');
  const view = new DataView(buffer);
  const dec = new TextDecoder('ascii');
  const riffMagic = dec.decode(new Uint8Array(buffer, 0, 4));
  if (riffMagic !== 'RIFF') throw new Error(`Not a RIFF file: magic ${riffMagic}`);
  const riffSize = view.getUint32(4, true);
  const formType = dec.decode(new Uint8Array(buffer, 8, 4));
  yield { id: 'RIFF', size: riffSize, formType, offset: 0 };

  let pos = 12;
  while (pos + 8 <= buffer.byteLength) {
    const id = dec.decode(new Uint8Array(buffer, pos, 4));
    const size = view.getUint32(pos + 4, true);
    const dataOffset = pos + 8;
    if (dataOffset + size > buffer.byteLength) {
      throw new RangeError(
        `RIFF chunk ${id} claims ${size} bytes but buffer only has ${buffer.byteLength - dataOffset}`,
      );
    }
    const data = new DataView(buffer, dataOffset, size);
    if (id === 'LIST') {
      // The first 4 bytes of a LIST payload are its listType
      // (e.g. 'INFO', 'adtl'). We yield the full data view so callers
      // can iterate sub-chunks; convention is to skip the first 4
      // bytes (already captured here as listType).
      const listType = size >= 4 ? dec.decode(new Uint8Array(buffer, dataOffset, 4)) : '';
      yield { id: 'LIST', size, offset: pos, listType, data };
    } else {
      yield { id, size, offset: pos, data };
    }
    // RIFF chunks are 2-byte aligned: pad if size is odd
    pos += 8 + size + (size % 2);
  }
}
