/**
 * WavMetadataProjection — cachedProjection capsule that reads LIST/INFO
 * tags (INAM title, IART artist, IBPM custom BPM) from a WAV file.
 *
 * The projection enables:
 *   - UI surfaces that want asset metadata without decoding samples
 *   - BeatMarkerProjection's optional BPM prior for warm-start onset
 *     detection (Spec 1.1.1 stretch; not wired yet)
 *
 * Mirrors the reference-implementation pattern of BeatMarkerProjection /
 * OnsetProjection: the standalone {@link extractWavMetadata} function
 * carries the actual logic and is used by callers that already have an
 * ArrayBuffer in hand; the {@link WavMetadataProjection} factory emits
 * the capsule contract for the harness compiler.
 *
 * @module
 */

import { Schema } from 'effect';
import { defineCapsule } from '@czap/core';
import type { CapsuleDef } from '@czap/core';
import { walkRiff } from '../decoders/riff.js';

/** Tag fields read from a WAV file's LIST/INFO chunks. */
export interface WavMetadata {
  readonly title?: string;
  readonly artist?: string;
  readonly bpm?: number;
}

/**
 * Walk LIST/INFO sub-chunks and project them onto the canonical
 * WavMetadata shape. Unknown tags are ignored. Returns an empty object
 * if the file has no LIST/INFO chunk.
 */
export function extractWavMetadata(bytes: ArrayBuffer): WavMetadata {
  const meta: { title?: string; artist?: string; bpm?: number } = {};
  const dec = new TextDecoder('utf-8');
  for (const chunk of walkRiff(bytes)) {
    // 'listType' is only present on the LIST variant of WavChunk; checking
    // for it narrows the union without relying on `id` (which is `string`
    // on the catch-all variant and doesn't discriminate cleanly).
    if (!('listType' in chunk)) continue;
    if (chunk.listType !== 'INFO') continue;
    // Skip the first 4 bytes (already captured as listType). Walk
    // sub-chunks: [fourCC][uint32 size][size bytes text, null-padded].
    const view = chunk.data;
    let p = 4;
    while (p + 8 <= view.byteLength) {
      const subId = dec.decode(new Uint8Array(view.buffer, view.byteOffset + p, 4));
      const subSize = view.getUint32(p + 4, true);
      const textOffset = p + 8;
      if (textOffset + subSize > view.byteLength) break; // malformed; bail
      const textBytes = new Uint8Array(view.buffer, view.byteOffset + textOffset, subSize);
      const text = dec.decode(textBytes).replace(/\0+$/, '');
      if (subId === 'INAM') meta.title = text;
      else if (subId === 'IART') meta.artist = text;
      else if (subId === 'IBPM') {
        const n = Number(text);
        if (Number.isFinite(n) && n > 0) meta.bpm = n;
      }
      p += 8 + subSize + (subSize % 2);
    }
  }
  return meta;
}

const WavMetadataSchema = Schema.Struct({
  title: Schema.optional(Schema.String),
  artist: Schema.optional(Schema.String),
  bpm: Schema.optional(Schema.Number),
});

/** Build a WavMetadataProjection cachedProjection capsule for a named audio asset. */
export function WavMetadataProjection(
  audioAssetId: string,
): CapsuleDef<'cachedProjection', unknown, WavMetadata, unknown> {
  return defineCapsule({
    _kind: 'cachedProjection',
    name: `${audioAssetId}:wav-metadata`,
    input: Schema.Unknown,
    output: WavMetadataSchema,
    capabilities: { reads: [`asset:${audioAssetId}`], writes: [] },
    invariants: [
      {
        name: 'output-shape',
        check: (_i, o) => typeof o === 'object' && o !== null,
        message: 'metadata output must be a (possibly empty) object',
      },
      {
        name: 'bpm-in-range',
        check: (_i, o) => {
          const m = o as WavMetadata;
          if (m.bpm === undefined) return true;
          return Number.isFinite(m.bpm) && m.bpm > 0 && m.bpm <= 400;
        },
        message: 'BPM (when present) must be a positive number <= 400',
      },
    ],
    budgets: { p95Ms: 50 },
    site: ['node'],
  });
}
