/**
 * Example asset declarations for the reference intro scene.
 * Registers the audio bed and its derived beat-marker projection.
 *
 * @module
 */

import { defineAsset, BeatMarkerProjection, WavMetadataProjection } from '@czap/assets';

/** Intro audio bed — silent 1-second fixture for testing. */
export const introBed = defineAsset({
  id: 'intro-bed',
  source: 'examples/scenes/intro-bed.wav',
  kind: 'audio',
  budgets: { decodeP95Ms: 50, memoryMb: 30 },
  invariants: [],
  attribution: {
    license: 'CC-BY-4.0',
    author: 'Hobby Musician',
  },
});

/** Beat-marker projection derived from introBed. */
export const introBedBeats = BeatMarkerProjection('intro-bed');

/** WAV LIST/INFO metadata projection derived from introBed. */
export const introBedMetadata = WavMetadataProjection('intro-bed');
