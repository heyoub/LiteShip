/**
 * WASM escape hatch -- capability detection, module loading, and dispatch.
 *
 * Detects WebAssembly availability, loads the czap-compute WASM module,
 * and provides a unified kernel interface that transparently falls back
 * to pure TypeScript implementations when WASM is unavailable.
 *
 * Usage:
 *   const kernels = WASMDispatch.kernels();        // TS fallbacks
 *   await WASMDispatch.load(wasmUrl);               // upgrade to WASM
 *   const kernels2 = WASMDispatch.kernels();        // now WASM-backed
 *
 * @module
 */

import { fallbackKernels } from './wasm-fallback.js';
import { WASM_SCRATCH_BASE } from './defaults.js';

// ---------------------------------------------------------------------------
// Public kernel interface
// ---------------------------------------------------------------------------

/** Kernel functions available from both WASM and TS fallback. */
export interface WASMKernels {
  /**
   * Sample a spring easing at `samples` evenly-spaced points in [0, 1].
   * Returns Float32Array of length `samples + 1`.
   */
  springCurve(stiffness: number, damping: number, mass: number, samples: number): Float32Array;

  /**
   * Batch boundary evaluation. For each value, returns the index of the
   * highest threshold where `value >= threshold`.
   * Thresholds must be sorted ascending.
   */
  batchBoundaryEval(thresholds: Float64Array, values: Float64Array): Uint32Array;

  /**
   * Normalize weights in-place so positive values sum to 1.0.
   * Negative weights clamped to 0. Returns the (modified) input array.
   */
  blendNormalize(weights: Float32Array): Float32Array;
}

// ---------------------------------------------------------------------------
// WASM instance state
// ---------------------------------------------------------------------------

/** Raw WASM export signatures matching C-ABI from czap-compute. */
interface WASMExports {
  memory: WebAssembly.Memory;
  spring_curve(stiffness: number, damping: number, mass: number, samples: number): number;
  batch_boundary_eval(thresholds_ptr: number, thresholds_len: number, values_ptr: number, values_len: number): number;
  blend_normalize(weights_ptr: number, len: number): void;
}

/**
 * Runtime-verified cast from WebAssembly's opaque exports to the typed interface.
 *
 * `WebAssembly.Instance.exports` is structurally `Record<string, unknown>` — functions,
 * memories, tables, and globals are all opaque at the type level. This helper
 * asserts the expected functions are present as callable values and that the
 * memory export is a WebAssembly.Memory instance, then narrows. If any required
 * export is missing or the wrong shape, it throws — making the cast runtime-safe.
 *
 * This is a sanctioned cast containment point (cf. tuple.ts, cell.ts, boundary.ts,
 * typed-ref.ts).
 */
const validateWASMExports = (exports: WebAssembly.Exports): WASMExports => {
  const requiredFunctions = ['spring_curve', 'batch_boundary_eval', 'blend_normalize'] as const;
  for (const name of requiredFunctions) {
    if (typeof exports[name] !== 'function') {
      throw new Error(
        `WASM module missing required export: "${name}". Available exports: [${Object.keys(exports).join(', ')}]`,
      );
    }
  }
  const mem = exports['memory'];
  const isMemoryShape =
    mem !== null && typeof mem === 'object' && 'buffer' in mem && Reflect.get(mem, 'buffer') instanceof ArrayBuffer;
  /* v8 ignore next 5 — sanctioned cast containment: the czap-compute WASM module always
     exports `memory` as a WebAssembly.Memory (whose `.buffer` is an ArrayBuffer); this
     guard exists only so the cast to WASMExports stays runtime-safe if a caller ever
     supplies a drift/tampered module. Cannot be reached by valid instantiate output. */
  if (!isMemoryShape) {
    throw new Error(
      `WASM module missing required memory export. Available exports: [${Object.keys(exports).join(', ')}]`,
    );
  }
  return exports as unknown as WASMExports;
};

/** Loaded WASM module state. */
let wasmInstance: WASMExports | null = null;

type WASMAvailabilityProbe =
  | { readonly status: 'ok'; readonly available: boolean }
  | { readonly status: 'unavailable' }
  | { readonly status: 'error'; readonly error: unknown };

function wasmAvailable(available: boolean): WASMAvailabilityProbe {
  return { status: 'ok', available };
}

function wasmUnavailable(): WASMAvailabilityProbe {
  return { status: 'unavailable' };
}

function wasmProbeError(error: unknown): WASMAvailabilityProbe {
  return { status: 'error', error };
}

function probeWASMAvailability(): WASMAvailabilityProbe {
  try {
    if (typeof WebAssembly === 'undefined') {
      return wasmUnavailable();
    }

    return wasmAvailable(typeof WebAssembly.instantiate === 'function' && typeof WebAssembly.Module === 'function');
  } catch (error) {
    return wasmProbeError(error);
  }
}

function isWASMAvailable(probe: WASMAvailabilityProbe): boolean {
  return probe.status === 'ok' ? probe.available : false;
}

// ---------------------------------------------------------------------------
// WASM-backed kernel wrappers
// ---------------------------------------------------------------------------

function createWASMKernels(wasm: WASMExports): WASMKernels {
  return {
    springCurve(stiffness: number, damping: number, mass: number, samples: number): Float32Array {
      const count = Math.min(Math.max(0, samples | 0), 255);
      const ptr = wasm.spring_curve(stiffness, damping, mass, count);
      const view = new Float32Array(wasm.memory.buffer, ptr, count + 1);
      return new Float32Array(view);
    },

    batchBoundaryEval(thresholds: Float64Array, values: Float64Array): Uint32Array {
      const tLen = thresholds.length;
      const vLen = values.length;

      const SCRATCH_BASE = WASM_SCRATCH_BASE;
      const thresholdsOffset = SCRATCH_BASE;
      const valuesOffset = thresholdsOffset + tLen * 4;

      const needed = valuesOffset + vLen * 4;
      const currentSize = wasm.memory.buffer.byteLength;
      if (needed > currentSize) {
        const pages = Math.ceil((needed - currentSize) / 65536);
        wasm.memory.grow(pages);
      }

      const threshF32 = new Float32Array(wasm.memory.buffer, thresholdsOffset, tLen);
      for (let i = 0; i < tLen; i++) {
        threshF32[i] = thresholds[i]!;
      }

      const valF32 = new Float32Array(wasm.memory.buffer, valuesOffset, vLen);
      for (let i = 0; i < vLen; i++) {
        valF32[i] = values[i]!;
      }

      const resultPtr = wasm.batch_boundary_eval(thresholdsOffset, tLen, valuesOffset, vLen);
      const view = new Uint32Array(wasm.memory.buffer, resultPtr, vLen);
      return new Uint32Array(view);
    },

    blendNormalize(weights: Float32Array): Float32Array {
      const len = weights.length;
      if (len === 0) return weights;

      const SCRATCH_BASE = WASM_SCRATCH_BASE;
      const needed = SCRATCH_BASE + len * 4;
      const currentSize = wasm.memory.buffer.byteLength;
      if (needed > currentSize) {
        const pages = Math.ceil((needed - currentSize) / 65536);
        wasm.memory.grow(pages);
      }

      const wasmWeights = new Float32Array(wasm.memory.buffer, SCRATCH_BASE, len);
      wasmWeights.set(weights);

      wasm.blend_normalize(SCRATCH_BASE, len);

      const result = new Float32Array(wasm.memory.buffer, SCRATCH_BASE, len);
      weights.set(result);
      return weights;
    },
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Public API of the {@link WASMDispatch} singleton: probe for WebAssembly,
 * asynchronously load the Rust compute module, and hand back either WASM or
 * {@link fallbackKernels} via {@link WASMDispatchAPI.kernels}.
 */
export interface WASMDispatchAPI {
  detect(): boolean;
  load(wasmUrl: string | ArrayBuffer): Promise<WASMKernels>;
  kernels(): WASMKernels;
  isLoaded(): boolean;
  unload(): void;
}

let wasmKernels: WASMKernels | null = null;
let loadingPromise: Promise<WASMKernels> | null = null;
let loadingToken: object | null = null;
let loadSession = 0;

/**
 * WASMDispatch — singleton that wires the Rust compute crate (spring, boundary,
 * blend kernels) into the runtime, falling back to {@link fallbackKernels}
 * when WebAssembly is unavailable or the module fails to load.
 */
export const WASMDispatch: WASMDispatchAPI = {
  detect(): boolean {
    return isWASMAvailable(probeWASMAvailability());
  },

  load(wasmUrl: string | ArrayBuffer): Promise<WASMKernels> {
    if (!WASMDispatch.detect()) {
      return Promise.reject(new Error('WebAssembly is not available in this environment'));
    }

    if (loadingPromise !== null) {
      return loadingPromise;
    }

    const currentSession = ++loadSession;
    const currentToken = {};
    loadingToken = currentToken;
    const promise = (async () => {
      try {
        let source: BufferSource;
        if (typeof wasmUrl === 'string') {
          const response = await fetch(wasmUrl);
          if (!response.ok) {
            throw new Error(`Failed to fetch WASM module: ${response.status} ${response.statusText}`);
          }
          source = await response.arrayBuffer();
        } else {
          source = wasmUrl;
        }

        const { instance } = await WebAssembly.instantiate(source, {
          env: {},
        });

        wasmInstance = validateWASMExports(instance.exports);

        wasmKernels = createWASMKernels(wasmInstance);

        // If unload() ran while we were awaiting fetch/instantiate, it will
        // bump the session and clear the just-installed WASM state.
        if (loadSession !== currentSession) {
          wasmInstance = null;
          wasmKernels = null;
          return fallbackKernels;
        }

        return wasmKernels;
      } finally {
        if (loadingToken === currentToken) {
          loadingPromise = null;
          loadingToken = null;
        }
      }
    })();

    loadingPromise = promise;
    return promise;
  },

  kernels(): WASMKernels {
    return wasmKernels ?? fallbackKernels;
  },

  isLoaded(): boolean {
    return wasmKernels !== null;
  },

  unload(): void {
    loadSession += 1;
    wasmInstance = null;
    wasmKernels = null;
    loadingPromise = null;
    loadingToken = null;
  },
};
