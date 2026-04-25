/**
 * OnsetProjection — cachedProjection that detects note-attack onsets
 * in a decoded audio asset via spectral-flux peaks on the energy
 * envelope. Reference implementation.
 *
 * @module
 */

import { Schema } from 'effect';
import { defineCapsule } from '@czap/core';
import type { CapsuleDef } from '@czap/core';

/** Detect note-attack onsets as an ordered array of sample indices. */
export function detectOnsets(
  audio: { sampleRate: number; samples: Float32Array | Int16Array },
): readonly number[] {
  const frameSize = 1024;
  const hop = 256;
  // Clamp to zero for clips shorter than one frame.
  const envLen = Math.max(0, Math.floor((audio.samples.length - frameSize) / hop));
  if (envLen === 0) return [];
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

  const flux = new Float32Array(envLen);
  for (let i = 1; i < envLen; i++) {
    flux[i] = Math.max(0, envelope[i]! - envelope[i - 1]!);
  }

  let maxFlux = 0;
  for (let i = 0; i < envLen; i++) if (flux[i]! > maxFlux) maxFlux = flux[i]!;
  const threshold = maxFlux * 0.3;

  const onsets: number[] = [];
  const refractory = Math.max(1, Math.floor((audio.sampleRate * 0.05) / hop));
  let lastOnsetFrame = -refractory;
  for (let i = 0; i < envLen; i++) {
    if (flux[i]! >= threshold && i - lastOnsetFrame >= refractory) {
      onsets.push(i * hop);
      lastOnsetFrame = i;
    }
  }
  return onsets;
}

/** Build an OnsetProjection cachedProjection capsule for a named audio asset. */
export function OnsetProjection(
  audioAssetId: string,
): CapsuleDef<'cachedProjection', unknown, unknown, unknown> {
  return defineCapsule({
    _kind: 'cachedProjection',
    name: `${audioAssetId}:onsets`,
    input: Schema.Unknown,
    output: Schema.Array(Schema.Number),
    capabilities: { reads: [`asset:${audioAssetId}`], writes: [] },
    invariants: [
      {
        name: 'onsets-ordered',
        check: (_i, o) => {
          const arr = o as readonly number[];
          for (let i = 1; i < arr.length; i++) if (arr[i]! <= arr[i - 1]!) return false;
          return true;
        },
        message: 'onsets must be strictly increasing',
      },
    ],
    budgets: { p95Ms: 200 },
    site: ['node'],
  });
}
