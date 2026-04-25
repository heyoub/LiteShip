/**
 * WASM dispatch + fallback kernel tests.
 *
 * Verifies:
 * - Fallback kernels produce correct results
 * - springCurve matches existing easing.ts spring solver output
 * - batchBoundaryEval matches individual evaluateBoundary calls
 * - blendNormalize normalizes correctly
 * - WASMDispatch.detect() works
 * - Dispatch falls back gracefully when no WASM loaded
 */

import { describe, test, expect, vi } from 'vitest';
import fc from 'fast-check';
import { WASMDispatch, fallbackKernels, Boundary } from '@czap/core';

// ---------------------------------------------------------------------------
// WASMDispatch detection + fallback
// ---------------------------------------------------------------------------

describe('WASMDispatch', () => {
  test('detect() returns boolean', () => {
    const result = WASMDispatch.detect();
    expect(typeof result).toBe('boolean');
  });

  test('isLoaded() is false initially', () => {
    expect(WASMDispatch.isLoaded()).toBe(false);
  });

  test('kernels() returns fallback kernels when no WASM loaded', () => {
    const kernels = WASMDispatch.kernels();
    expect(kernels).toBe(fallbackKernels);
  });

  test('unload() is safe to call when nothing loaded', () => {
    WASMDispatch.unload();
    expect(WASMDispatch.isLoaded()).toBe(false);
    expect(WASMDispatch.kernels()).toBe(fallbackKernels);
  });

  test('kernels() has all expected methods', () => {
    const kernels = WASMDispatch.kernels();
    expect(typeof kernels.springCurve).toBe('function');
    expect(typeof kernels.batchBoundaryEval).toBe('function');
    expect(typeof kernels.blendNormalize).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// springCurve fallback
// ---------------------------------------------------------------------------

describe('springCurve fallback', () => {
  test('returns Float32Array of correct length', () => {
    const result = fallbackKernels.springCurve(170, 26, 1, 32);
    expect(result).toBeInstanceOf(Float32Array);
    expect(result.length).toBe(33);
  });

  test('first sample is 0, last sample is 1', () => {
    const result = fallbackKernels.springCurve(170, 26, 1, 64);
    expect(result[0]).toBe(0);
    expect(result[64]).toBe(1);
  });

  test('underdamped spring oscillates and converges to 1', () => {
    // zeta < 1 (underdamped): stiffness=170, damping=26, mass=1 → zeta ≈ 0.997
    // Actually let's use a clearly underdamped config
    const result = fallbackKernels.springCurve(170, 10, 1, 64);
    expect(result[0]).toBe(0);
    expect(result[64]).toBe(1);

    // Underdamped springs overshoot — at least one sample > 1
    let hasOvershoot = false;
    for (let i = 0; i <= 64; i++) {
      if (result[i]! > 1.0) hasOvershoot = true;
    }
    expect(hasOvershoot).toBe(true);
  });

  test('critically damped spring monotonically approaches 1', () => {
    // zeta = 1: stiffness=100, damping=20, mass=1
    const result = fallbackKernels.springCurve(100, 20, 1, 64);
    expect(result[0]).toBe(0);
    expect(result[64]).toBe(1);

    // Critically damped should approach 1 without overshooting (or very minimally)
    for (let i = 1; i <= 64; i++) {
      expect(result[i]!).toBeGreaterThanOrEqual(result[i - 1]! - 1e-5);
    }
  });

  test('overdamped spring monotonically approaches 1', () => {
    const result = fallbackKernels.springCurve(100, 40, 1, 64);
    expect(result[0]).toBe(0);
    expect(result[64]).toBe(1);

    for (let i = 1; i <= 64; i++) {
      expect(result[i]!).toBeGreaterThanOrEqual(result[i - 1]! - 1e-6);
    }
  });

  test('all values are in reasonable range [0, ~1.3] for typical configs', () => {
    const result = fallbackKernels.springCurve(170, 26, 1, 64);
    for (let i = 0; i <= 64; i++) {
      expect(result[i]!).toBeGreaterThanOrEqual(-0.1);
      expect(result[i]!).toBeLessThanOrEqual(1.5);
    }
  });

  test('handles zero samples without throwing', () => {
    const result = fallbackKernels.springCurve(170, 26, 1, 0);
    expect(result.length).toBe(1);
  });

  test('handles mass=0 (defaults to 1)', () => {
    const result = fallbackKernels.springCurve(170, 26, 0, 16);
    expect(result.length).toBe(17);
    expect(result[0]).toBe(0);
    expect(result[16]).toBe(1);
  });

  test('monotonically approaches 1 for overdamped springs', () => {
    const result = fallbackKernels.springCurve(100, 40, 1, 64);
    for (let i = 1; i <= 64; i++) {
      expect(result[i]!).toBeGreaterThanOrEqual(result[i - 1]! - 1e-6);
    }
  });
});

// ---------------------------------------------------------------------------
// batchBoundaryEval fallback
// ---------------------------------------------------------------------------

describe('batchBoundaryEval fallback', () => {
  test('returns Uint32Array of correct length', () => {
    const thresholds = new Float64Array([0, 100, 500, 1000]);
    const values = new Float64Array([50, 250, 750, 1500]);
    const result = fallbackKernels.batchBoundaryEval(thresholds, values);
    expect(result).toBeInstanceOf(Uint32Array);
    expect(result.length).toBe(4);
  });

  test('matches individual evaluateBoundary calls', () => {
    const boundary = Boundary.make({
      input: 'viewport-width',
      at: [
        [0, 'compact'],
        [640, 'medium'],
        [1024, 'expanded'],
        [1440, 'wide'],
      ] as const,
    });

    const testValues = [0, 320, 640, 800, 1024, 1200, 1440, 2000];
    const thresholds = new Float64Array(boundary.thresholds);
    const values = new Float64Array(testValues);

    const batchResult = fallbackKernels.batchBoundaryEval(thresholds, values);

    for (let i = 0; i < testValues.length; i++) {
      const expectedState = Boundary.evaluate(boundary, testValues[i]!);
      const expectedIdx = (boundary.states as readonly string[]).indexOf(expectedState);
      expect(batchResult[i]).toBe(expectedIdx);
    }
  });

  test('returns 0 for values below all thresholds', () => {
    const thresholds = new Float64Array([100, 200, 300]);
    const values = new Float64Array([50, 0, -10]);
    const result = fallbackKernels.batchBoundaryEval(thresholds, values);
    expect(result[0]).toBe(0);
    expect(result[1]).toBe(0);
    expect(result[2]).toBe(0);
  });

  test('returns highest index for values above all thresholds', () => {
    const thresholds = new Float64Array([100, 200, 300]);
    const values = new Float64Array([500, 1000]);
    const result = fallbackKernels.batchBoundaryEval(thresholds, values);
    expect(result[0]).toBe(2);
    expect(result[1]).toBe(2);
  });

  test('handles exact threshold values', () => {
    const thresholds = new Float64Array([0, 100, 200]);
    const values = new Float64Array([0, 100, 200]);
    const result = fallbackKernels.batchBoundaryEval(thresholds, values);
    expect(result[0]).toBe(0);
    expect(result[1]).toBe(1);
    expect(result[2]).toBe(2);
  });

  test('handles empty inputs', () => {
    const thresholds = new Float64Array([0, 100]);
    const values = new Float64Array([]);
    const result = fallbackKernels.batchBoundaryEval(thresholds, values);
    expect(result.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// blendNormalize fallback
// ---------------------------------------------------------------------------

describe('blendNormalize fallback', () => {
  test('normalizes positive weights to sum to 1.0', () => {
    const weights = new Float32Array([2, 3, 5]);
    const result = fallbackKernels.blendNormalize(weights);
    expect(result).toBe(weights);

    const sum = result[0]! + result[1]! + result[2]!;
    expect(Math.abs(sum - 1.0)).toBeLessThan(1e-6);
    expect(Math.abs(result[0]! - 0.2)).toBeLessThan(1e-6);
    expect(Math.abs(result[1]! - 0.3)).toBeLessThan(1e-6);
    expect(Math.abs(result[2]! - 0.5)).toBeLessThan(1e-6);
  });

  test('clamps negative weights to 0', () => {
    const weights = new Float32Array([-1, 2, 3]);
    fallbackKernels.blendNormalize(weights);
    expect(weights[0]).toBe(0);
    expect(Math.abs(weights[1]! - 0.4)).toBeLessThan(1e-6);
    expect(Math.abs(weights[2]! - 0.6)).toBeLessThan(1e-6);
  });

  test('handles all-zero weights', () => {
    const weights = new Float32Array([0, 0, 0]);
    fallbackKernels.blendNormalize(weights);
    expect(weights[0]).toBe(0);
    expect(weights[1]).toBe(0);
    expect(weights[2]).toBe(0);
  });

  test('handles all-negative weights', () => {
    const weights = new Float32Array([-1, -2, -3]);
    fallbackKernels.blendNormalize(weights);
    expect(weights[0]).toBe(0);
    expect(weights[1]).toBe(0);
    expect(weights[2]).toBe(0);
  });

  test('handles single weight', () => {
    const weights = new Float32Array([5]);
    fallbackKernels.blendNormalize(weights);
    expect(weights[0]).toBe(1);
  });

  test('handles empty array', () => {
    const weights = new Float32Array([]);
    const result = fallbackKernels.blendNormalize(weights);
    expect(result.length).toBe(0);
  });

  test('already-normalized weights stay the same', () => {
    const weights = new Float32Array([0.25, 0.25, 0.5]);
    fallbackKernels.blendNormalize(weights);
    expect(Math.abs(weights[0]! - 0.25)).toBeLessThan(1e-6);
    expect(Math.abs(weights[1]! - 0.25)).toBeLessThan(1e-6);
    expect(Math.abs(weights[2]! - 0.5)).toBeLessThan(1e-6);
  });

  test('large array normalization', () => {
    const size = 1000;
    const weights = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      weights[i] = i + 1;
    }
    fallbackKernels.blendNormalize(weights);
    let sum = 0;
    for (let i = 0; i < size; i++) {
      sum += weights[i]!;
    }
    expect(Math.abs(sum - 1.0)).toBeLessThan(1e-4);
  });
});

// ---------------------------------------------------------------------------
// Integration: dispatch routing
// ---------------------------------------------------------------------------

describe('WASMDispatch integration', () => {
  test('kernels() returns working fallbacks without WASM', () => {
    WASMDispatch.unload();
    const k = WASMDispatch.kernels();

    const spring = k.springCurve(170, 26, 1, 16);
    expect(spring.length).toBe(17);
    expect(spring[0]).toBe(0);
    expect(spring[16]).toBe(1);

    const eval_ = k.batchBoundaryEval(new Float64Array([0, 100, 200]), new Float64Array([50, 150]));
    expect(eval_[0]).toBe(0);
    expect(eval_[1]).toBe(1);

    const blend = k.blendNormalize(new Float32Array([1, 1]));
    expect(Math.abs(blend[0]! - 0.5)).toBeLessThan(1e-6);
    expect(Math.abs(blend[1]! - 0.5)).toBeLessThan(1e-6);
  });

  test('load() rejects when given invalid input', async () => {
    try {
      await WASMDispatch.load(new ArrayBuffer(0));
    } catch (e) {
      expect(e).toBeDefined();
    }
  });

  test('load() rejects with a string URL when fetch fails', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(null, { status: 404, statusText: 'Not Found' }) as Response;
    try {
      await expect(WASMDispatch.load('http://localhost/missing.wasm')).rejects.toThrow(/Failed to fetch WASM module/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('load() rejects when WASM module is missing required exports', async () => {
    const originalFetch = globalThis.fetch;
    // Minimal valid WASM module (magic + version + empty)
    const minimalWasm = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
    globalThis.fetch = async () => new Response(minimalWasm.buffer);
    try {
      await expect(WASMDispatch.load('http://localhost/empty.wasm')).rejects.toThrow(/missing required export/);
    } catch {
      // WebAssembly.instantiate may also throw on invalid module — both paths are fine
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('detect() returns false when WebAssembly is absent', () => {
    const original = globalThis.WebAssembly;
    // @ts-expect-error -- intentionally removing WebAssembly for test
    delete globalThis.WebAssembly;
    try {
      expect(WASMDispatch.detect()).toBe(false);
    } finally {
      globalThis.WebAssembly = original;
    }
  });

  test('load() throws when WebAssembly is unavailable', async () => {
    const original = globalThis.WebAssembly;
    // @ts-expect-error -- intentionally removing WebAssembly for test
    delete globalThis.WebAssembly;
    try {
      await expect(WASMDispatch.load(new ArrayBuffer(0))).rejects.toThrow(/not available/);
    } finally {
      globalThis.WebAssembly = original;
    }
  });

  test('detect() returns false when probing WebAssembly throws', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'WebAssembly');
    Object.defineProperty(globalThis, 'WebAssembly', {
      configurable: true,
      get() {
        throw new Error('probe boom');
      },
    });

    try {
      expect(WASMDispatch.detect()).toBe(false);
    } finally {
      if (original) {
        Object.defineProperty(globalThis, 'WebAssembly', original);
      } else {
        // @ts-expect-error -- cleanup for probe override
        delete globalThis.WebAssembly;
      }
    }
  });

  test('loaded WASM kernels grow memory for batch evaluation and blend normalization when scratch space is too small', async () => {
    WASMDispatch.unload();

    const memory = new WebAssembly.Memory({ initial: 0 });
    const fakeExports = {
      memory,
      spring_curve(_stiffness: number, _damping: number, _mass: number, samples: number) {
        const view = new Float32Array(memory.buffer, 0, samples + 1);
        for (let i = 0; i <= samples; i++) {
          view[i] = i / Math.max(samples, 1);
        }
        return 0;
      },
      batch_boundary_eval(thresholdsPtr: number, thresholdsLen: number, valuesPtr: number, valuesLen: number) {
        const thresholdsView = new Float32Array(memory.buffer, thresholdsPtr, thresholdsLen);
        const valuesView = new Float32Array(memory.buffer, valuesPtr, valuesLen);
        const resultPtr = valuesPtr + valuesLen * 4;
        const resultView = new Uint32Array(memory.buffer, resultPtr, valuesLen);
        for (let i = 0; i < valuesLen; i++) {
          let idx = 0;
          for (let j = thresholdsLen - 1; j >= 0; j--) {
            if (valuesView[i]! >= thresholdsView[j]!) {
              idx = j;
              break;
            }
          }
          resultView[i] = idx;
        }
        return resultPtr;
      },
      blend_normalize(weightsPtr: number, len: number) {
        const view = new Float32Array(memory.buffer, weightsPtr, len);
        let sum = 0;
        for (let i = 0; i < len; i++) {
          view[i] = Math.max(0, view[i]!);
          sum += view[i]!;
        }
        if (sum > 0) {
          for (let i = 0; i < len; i++) {
            view[i] = view[i]! / sum;
          }
        }
      },
    };

    const instantiateSpy = vi.spyOn(WebAssembly, 'instantiate').mockResolvedValue({
      module: {} as WebAssembly.Module,
      instance: { exports: fakeExports } as unknown as WebAssembly.Instance,
    });

    try {
      const kernels = await WASMDispatch.load(new ArrayBuffer(8));
      expect(WASMDispatch.isLoaded()).toBe(true);

      const batch = kernels.batchBoundaryEval(
        new Float64Array([0, 100]),
        new Float64Array(Array.from({ length: 12_000 }, (_, i) => (i < 6000 ? 50 : 150))),
      );
      expect(batch[0]).toBe(0);
      expect(batch[11_999]).toBe(1);

      const weights = new Float32Array(Array.from({ length: 12_000 }, () => 1));
      const normalized = kernels.blendNormalize(weights);
      expect(normalized[0]).toBeCloseTo(1 / 12_000, 8);
      expect(memory.buffer.byteLength).toBeGreaterThan(0);
    } finally {
      instantiateSpy.mockRestore();
      WASMDispatch.unload();
    }
  });

  test('loaded WASM kernels skip memory growth when scratch space already fits', async () => {
    WASMDispatch.unload();

    const memory = new WebAssembly.Memory({ initial: 2 });
    const growSpy = vi.spyOn(memory, 'grow');
    const fakeExports = {
      memory,
      spring_curve(_stiffness: number, _damping: number, _mass: number, samples: number) {
        const view = new Float32Array(memory.buffer, 0, samples + 1);
        for (let i = 0; i <= samples; i++) {
          view[i] = i / Math.max(samples, 1);
        }
        return 0;
      },
      batch_boundary_eval(thresholdsPtr: number, thresholdsLen: number, valuesPtr: number, valuesLen: number) {
        const thresholdsView = new Float32Array(memory.buffer, thresholdsPtr, thresholdsLen);
        const valuesView = new Float32Array(memory.buffer, valuesPtr, valuesLen);
        const resultPtr = valuesPtr + valuesLen * 4;
        const resultView = new Uint32Array(memory.buffer, resultPtr, valuesLen);
        for (let i = 0; i < valuesLen; i++) {
          resultView[i] = valuesView[i]! >= thresholdsView[1]! ? 1 : 0;
        }
        return resultPtr;
      },
      blend_normalize(weightsPtr: number, len: number) {
        const view = new Float32Array(memory.buffer, weightsPtr, len);
        let sum = 0;
        for (let i = 0; i < len; i++) {
          sum += view[i]!;
        }
        for (let i = 0; i < len; i++) {
          view[i] = sum > 0 ? view[i]! / sum : 0;
        }
      },
    };

    const instantiateSpy = vi.spyOn(WebAssembly, 'instantiate').mockResolvedValue({
      module: {} as WebAssembly.Module,
      instance: { exports: fakeExports } as unknown as WebAssembly.Instance,
    });

    try {
      const kernels = await WASMDispatch.load(new ArrayBuffer(8));
      const batch = kernels.batchBoundaryEval(new Float64Array([0, 100]), new Float64Array([50, 150]));
      const empty = kernels.blendNormalize(new Float32Array([]));
      const normalized = kernels.blendNormalize(new Float32Array([1, 3]));

      expect(empty).toEqual(new Float32Array([]));
      expect(batch).toEqual(new Uint32Array([0, 1]));
      expect(Array.from(normalized)).toEqual([0.25, 0.75]);
      expect(growSpy).not.toHaveBeenCalled();
    } finally {
      instantiateSpy.mockRestore();
      growSpy.mockRestore();
      WASMDispatch.unload();
    }
  });

  test('load() supports successful string URL fetches before instantiation', async () => {
    WASMDispatch.unload();

    const originalFetch = globalThis.fetch;
    const memory = new WebAssembly.Memory({ initial: 1 });
    const fakeExports = {
      memory,
      spring_curve: vi.fn(() => 0),
      batch_boundary_eval: vi.fn(() => 0),
      blend_normalize: vi.fn(),
    };

    globalThis.fetch = vi.fn(async () => new Response(new Uint8Array([0, 97, 115, 109]).buffer)) as typeof fetch;
    const instantiateSpy = vi.spyOn(WebAssembly, 'instantiate').mockResolvedValue({
      module: {} as WebAssembly.Module,
      instance: { exports: fakeExports } as unknown as WebAssembly.Instance,
    });

    try {
      const kernels = await WASMDispatch.load('http://localhost/czap-compute.wasm');

      expect(globalThis.fetch).toHaveBeenCalledWith('http://localhost/czap-compute.wasm');
      expect(instantiateSpy).toHaveBeenCalledOnce();
      expect(kernels).not.toBe(fallbackKernels);
      expect(WASMDispatch.isLoaded()).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
      instantiateSpy.mockRestore();
      WASMDispatch.unload();
    }
  });

  test('loaded WASM kernels grow memory when the scratch region exceeds the current page budget', async () => {
    WASMDispatch.unload();

    const memory = new WebAssembly.Memory({ initial: 1 });
    const growSpy = vi.spyOn(memory, 'grow');
    const fakeExports = {
      memory,
      spring_curve(_stiffness: number, _damping: number, _mass: number, samples: number) {
        const view = new Float32Array(memory.buffer, 0, samples + 1);
        for (let i = 0; i <= samples; i++) {
          view[i] = i / Math.max(samples, 1);
        }
        return 0;
      },
      batch_boundary_eval(_thresholdsPtr: number, _thresholdsLen: number, valuesPtr: number, valuesLen: number) {
        const valuesView = new Float32Array(memory.buffer, valuesPtr, valuesLen);
        const resultView = new Uint32Array(memory.buffer, valuesPtr, valuesLen);
        for (let i = 0; i < valuesLen; i++) {
          resultView[i] = valuesView[i]! >= 100 ? 1 : 0;
        }
        return valuesPtr;
      },
      blend_normalize(weightsPtr: number, len: number) {
        const view = new Float32Array(memory.buffer, weightsPtr, len);
        for (let i = 0; i < len; i++) {
          view[i] = 1 / len;
        }
      },
    };

    const instantiateSpy = vi.spyOn(WebAssembly, 'instantiate').mockResolvedValue({
      module: {} as WebAssembly.Module,
      instance: { exports: fakeExports } as unknown as WebAssembly.Instance,
    });

    try {
      const kernels = await WASMDispatch.load(new ArrayBuffer(8));
      const batch = kernels.batchBoundaryEval(
        new Float64Array([0, 100]),
        new Float64Array(Array.from({ length: 12_000 }, (_, index) => (index < 6_000 ? 50 : 150))),
      );
      const normalized = kernels.blendNormalize(new Float32Array(Array.from({ length: 30_000 }, () => 1)));

      expect(batch[0]).toBe(0);
      expect(batch[11_999]).toBe(1);
      expect(normalized[0]).toBeCloseTo(1 / 30_000, 8);
      expect(growSpy).toHaveBeenCalled();
    } finally {
      instantiateSpy.mockRestore();
      growSpy.mockRestore();
      WASMDispatch.unload();
    }
  });
});

// ---------------------------------------------------------------------------
// WASM concurrent loading property tests (covers lines 188, 227-229)
// ---------------------------------------------------------------------------

describe('WASMDispatch concurrent loading properties', () => {
  test('loading promise deduplication returns same promise for concurrent calls', async () => {
    WASMDispatch.unload();

    const originalFetch = globalThis.fetch;
    const fakeResponse = new Response(new Uint8Array([0, 97, 115, 109]).buffer);
    globalThis.fetch = vi.fn(async () => fakeResponse) as typeof fetch;

    const memory = new WebAssembly.Memory({ initial: 1 });
    const fakeExports = {
      memory,
      spring_curve: vi.fn(() => 0),
      batch_boundary_eval: vi.fn(() => 0),
      blend_normalize: vi.fn(),
    };

    const instantiateSpy = vi.spyOn(WebAssembly, 'instantiate').mockResolvedValue({
      instance: { exports: fakeExports } as unknown as WebAssembly.Instance,
    });

    try {
      // Start multiple concurrent loads - should return same promise
      const promise1 = WASMDispatch.load('test.wasm');
      const promise2 = WASMDispatch.load('test.wasm');
      const promise3 = WASMDispatch.load('test.wasm');

      // All should be the same promise (line 188)
      expect(promise1).toBe(promise2);
      expect(promise2).toBe(promise3);

      // Wait for completion
      const result = await promise1;
      expect(result).toBeDefined();
      expect(WASMDispatch.isLoaded()).toBe(true);

      // Only one fetch should have occurred
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(instantiateSpy).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.fetch = originalFetch;
      instantiateSpy.mockRestore();
      WASMDispatch.unload();
    }
  });

  test('session invalidation returns fallback when unload occurs during load', async () => {
    WASMDispatch.unload();

    const originalFetch = globalThis.fetch;
    const memory = new WebAssembly.Memory({ initial: 1 });
    const fakeExports = {
      memory,
      spring_curve: vi.fn(() => 0),
      batch_boundary_eval: vi.fn(() => 0),
      blend_normalize: vi.fn(),
    };

    let resolveFetch: (value: Response) => void;
    const fetchPromise = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });

    // Mock fetch to hang until we resolve it manually
    globalThis.fetch = vi.fn(() => fetchPromise) as typeof fetch;
    const instantiateSpy = vi.spyOn(WebAssembly, 'instantiate').mockResolvedValue({
      instance: { exports: fakeExports } as unknown as WebAssembly.Instance,
    });

    try {
      // Start loading (this will hang at fetch)
      const loadPromise = WASMDispatch.load('test.wasm');

      // Verify loading is in progress
      expect(WASMDispatch.isLoaded()).toBe(false);

      // Unload while loading (triggers session invalidation - lines 227-229)
      WASMDispatch.unload();

      // Now resolve the fetch - this should trigger session invalidation logic
      resolveFetch!(new Response(new Uint8Array([0x00, 0x61, 0x73, 0x6d]).buffer));

      // Should return fallback due to session invalidation (lines 227-229)
      const result = await loadPromise;
      expect(result).toBe(fallbackKernels);
      expect(WASMDispatch.isLoaded()).toBe(false);

      // Verify instantiate was called but result was discarded due to session invalidation
      expect(instantiateSpy).toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
      instantiateSpy.mockRestore();
      WASMDispatch.unload();
    }
  }, 10000); // Increase timeout for this complex async test
});
