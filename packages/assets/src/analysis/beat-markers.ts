/**
 * BeatMarkerProjection — cachedProjection capsule deriving beat markers
 * from a decoded audio asset via autocorrelation on the short-time
 * energy envelope. Reference implementation — users can plug in a more
 * sophisticated analyzer by defining their own cachedProjection capsule
 * with the same input/output shape.
 *
 * @module
 */

import { Schema } from 'effect';
import { defineCapsule } from '@czap/core';
import type { CapsuleDef } from '@czap/core';

/** Detected beat markers + overall BPM estimate. */
export interface BeatMarkerSet {
  readonly bpm: number;
  readonly beats: readonly number[];
}

/** Detect downbeats on a decoded audio buffer. */
export function detectBeats(
  audio: { sampleRate: number; samples: Float32Array | Int16Array },
): BeatMarkerSet {
  const frameSize = 1024;
  const hop = 256;
  // Clamp to zero for clips shorter than one frame so we return an empty
  // result instead of throwing on a negative typed-array length.
  const envLen = Math.max(0, Math.floor((audio.samples.length - frameSize) / hop));
  if (envLen === 0) return { bpm: 0, beats: [] };
  const envelope = new Float32Array(envLen);
  for (let i = 0; i < envLen; i++) {
    let sum = 0;
    const off = i * hop;
    for (let j = 0; j < frameSize; j++) {
      const v = typeof audio.samples[off + j] === 'number' ? Number(audio.samples[off + j]) : 0;
      sum += v * v;
    }
    envelope[i] = Math.sqrt(sum / frameSize);
  }

  const minLag = Math.max(1, Math.floor((audio.sampleRate * 60) / 200 / hop));
  const maxLag = Math.floor((audio.sampleRate * 60) / 60 / hop);
  let bestLag = minLag;
  let bestCorr = 0;
  for (let lag = minLag; lag < maxLag && lag < envelope.length; lag++) {
    let corr = 0;
    for (let i = 0; i + lag < envelope.length; i++) corr += envelope[i]! * envelope[i + lag]!;
    if (corr > bestCorr) { bestCorr = corr; bestLag = lag; }
  }

  const bpm = (audio.sampleRate * 60) / (bestLag * hop);
  const beatSpacing = bestLag * hop;
  const beats: number[] = [];
  const maxEnv = envelopeMax(envelope);
  const threshold = maxEnv * 0.4;
  for (let i = 0; i < audio.samples.length; i += beatSpacing) {
    const envIdx = Math.floor(i / hop);
    if (envIdx < envelope.length && envelope[envIdx]! >= threshold) beats.push(i);
  }
  return { bpm, beats };
}

function envelopeMax(env: Float32Array): number {
  let m = 0;
  for (let i = 0; i < env.length; i++) if (env[i]! > m) m = env[i]!;
  return m;
}

const BeatMarkerSetSchema = Schema.Struct({
  bpm: Schema.Number,
  beats: Schema.Array(Schema.Number),
});

/** Build a BeatMarkerProjection cachedProjection capsule for a named audio asset. */
export function BeatMarkerProjection(
  audioAssetId: string,
): CapsuleDef<'cachedProjection', unknown, unknown, unknown> {
  return defineCapsule({
    _kind: 'cachedProjection',
    name: `${audioAssetId}:beats`,
    input: Schema.Unknown,
    output: BeatMarkerSetSchema,
    capabilities: { reads: [`asset:${audioAssetId}`], writes: [] },
    invariants: [
      {
        name: 'beats-ordered',
        check: (_i, o) => {
          const set = o as BeatMarkerSet;
          for (let i = 1; i < set.beats.length; i++) if (set.beats[i]! <= set.beats[i - 1]!) return false;
          return true;
        },
        message: 'beats must be strictly increasing sample indices',
      },
      {
        name: 'bpm-in-range',
        check: (_i, o) => {
          const set = o as BeatMarkerSet;
          return set.bpm >= 40 && set.bpm <= 240;
        },
        message: 'detected BPM must lie in [40, 240]',
      },
    ],
    budgets: { p95Ms: 200 },
    site: ['node'],
  });
}
