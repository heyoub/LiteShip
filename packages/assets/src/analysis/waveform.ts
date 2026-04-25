/**
 * WaveformProjection — cachedProjection that emits a downsampled
 * RMS-per-bin waveform from a decoded audio asset. Useful for the
 * dev-mode scrubber and visual waveform displays.
 *
 * @module
 */

import { Schema } from 'effect';
import { defineCapsule } from '@czap/core';
import type { CapsuleDef } from '@czap/core';

/** Compute a normalized RMS-per-bin waveform. */
export function computeWaveform(
  audio: { sampleRate: number; samples: Float32Array | Int16Array },
  opts: { bins: number },
): readonly number[] {
  const out: number[] = new Array(opts.bins).fill(0);
  const stride = Math.max(1, Math.floor(audio.samples.length / opts.bins));
  let maxRms = 0;
  for (let b = 0; b < opts.bins; b++) {
    let sum = 0;
    let count = 0;
    const start = b * stride;
    const end = Math.min(audio.samples.length, start + stride);
    for (let i = start; i < end; i++) {
      const v = typeof audio.samples[i] === 'number' ? Number(audio.samples[i]) : 0;
      sum += v * v;
      count++;
    }
    const rms = count > 0 ? Math.sqrt(sum / count) : 0;
    out[b] = rms;
    if (rms > maxRms) maxRms = rms;
  }
  if (maxRms > 0) for (let b = 0; b < opts.bins; b++) out[b] = out[b]! / maxRms;
  return out;
}

/** Build a WaveformProjection cachedProjection capsule for a named audio asset. */
export function WaveformProjection(
  audioAssetId: string,
  opts: { bins: number },
): CapsuleDef<'cachedProjection', unknown, unknown, unknown> {
  return defineCapsule({
    _kind: 'cachedProjection',
    name: `${audioAssetId}:waveform:${opts.bins}`,
    input: Schema.Unknown,
    output: Schema.Array(Schema.Number),
    capabilities: { reads: [`asset:${audioAssetId}`], writes: [] },
    invariants: [
      {
        name: 'bin-count-matches',
        check: (_i, o) => (o as readonly number[]).length === opts.bins,
        message: `waveform must emit exactly ${opts.bins} bins`,
      },
      {
        name: 'values-normalized',
        check: (_i, o) => (o as readonly number[]).every((v) => v >= 0 && v <= 1),
        message: 'waveform values must be in [0, 1]',
      },
    ],
    budgets: { p95Ms: 100 },
    site: ['node', 'browser'],
  });
}
