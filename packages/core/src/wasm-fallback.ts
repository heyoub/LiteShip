/**
 * Pure TypeScript fallback kernels for WASM compute functions.
 *
 * These produce bit-identical results (within float precision) to the
 * Rust WASM kernels. When WASM is unavailable, these are used automatically.
 *
 * @module
 */

import type { WASMKernels } from './wasm-dispatch.js';

function springCurve(stiffness: number, damping: number, mass: number, samples: number): Float32Array {
  const m = mass <= 0 ? 1 : mass;
  const count = Math.min(Math.max(0, samples | 0), 255);
  const omega = Math.sqrt(stiffness / m);
  const zeta = damping / (2 * Math.sqrt(stiffness * m));
  const out = new Float32Array(count + 1);

  for (let i = 0; i <= count; i++) {
    const t = i / count;
    if (t <= 0) {
      out[i] = 0;
    } else if (t >= 1) {
      out[i] = 1;
    } else if (zeta < 1) {
      const omegaD = omega * Math.sqrt(1 - zeta * zeta);
      out[i] =
        1 - Math.exp(-zeta * omega * t) * (Math.cos(omegaD * t) + ((zeta * omega) / omegaD) * Math.sin(omegaD * t));
    } else if (zeta === 1) {
      out[i] = 1 - (1 + omega * t) * Math.exp(-omega * t);
    } else {
      const s = Math.sqrt(zeta * zeta - 1);
      const r1 = -omega * (zeta + s);
      const r2 = -omega * (zeta - s);
      const c1 = r2 / (r2 - r1);
      const c2 = -r1 / (r2 - r1);
      out[i] = 1 - (c1 * Math.exp(r1 * t) + c2 * Math.exp(r2 * t));
    }
  }

  return out;
}

function batchBoundaryEval(thresholds: Float64Array, values: Float64Array): Uint32Array {
  const tLen = thresholds.length;
  const vLen = values.length;
  const out = new Uint32Array(vLen);

  for (let vi = 0; vi < vLen; vi++) {
    const value = values[vi]!;
    let stateIdx = 0;

    for (let ti = tLen - 1; ti >= 0; ti--) {
      if (value >= thresholds[ti]!) {
        stateIdx = ti;
        break;
      }
    }

    out[vi] = stateIdx;
  }

  return out;
}

function blendNormalize(weights: Float32Array): Float32Array {
  const len = weights.length;
  if (len === 0) return weights;

  let total = 0;
  for (let i = 0; i < len; i++) {
    let w = weights[i]!;
    if (w < 0) {
      w = 0;
      weights[i] = 0;
    }
    total += w;
  }

  if (total > 0) {
    const inv = 1 / total;
    for (let i = 0; i < len; i++) {
      weights[i] = weights[i]! * inv;
    }
  }

  return weights;
}

/**
 * Pure-JS implementation of the {@link WASMKernels} contract.
 *
 * Selected automatically by {@link WASMDispatch} when the Rust compute crate
 * cannot be instantiated (e.g. missing `WebAssembly`, CSP restrictions, or
 * startup failure). Produces results bit-identical to the WASM build within
 * IEEE-754 precision limits.
 */
export const fallbackKernels: WASMKernels = {
  springCurve,
  batchBoundaryEval,
  blendNormalize,
};
