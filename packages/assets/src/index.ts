/** `@czap/assets` — **LiteShip** asset capsules and cached analysis projections (waveform, beats, onsets). */

export { defineAsset, AssetRef, getAssetRegistry } from './contract.js';
// `resetAssetRegistry` is intentionally NOT re-exported here — it mutates
// global registry state and ships from `@czap/assets/testing` only.
export type { AssetDecl, AssetKind } from './contract.js';

export { audioDecoder } from './decoders/audio.js';
export type { DecodedAudio } from './decoders/audio.js';
export { videoDecoder } from './decoders/video.js';
export type { DecodedVideo } from './decoders/video.js';
export { imageDecoder } from './decoders/image.js';
export type { DecodedImage } from './decoders/image.js';
export { walkRiff } from './decoders/riff.js';
export type { WavChunk, FourCC } from './decoders/riff.js';

export { detectBeats, BeatMarkerProjection } from './analysis/beat-markers.js';
export type { BeatMarkerSet } from './analysis/beat-markers.js';
export { detectOnsets, OnsetProjection } from './analysis/onsets.js';
export { computeWaveform, WaveformProjection } from './analysis/waveform.js';
export { extractWavMetadata, WavMetadataProjection } from './analysis/wav-metadata.js';
export type { WavMetadata } from './analysis/wav-metadata.js';
