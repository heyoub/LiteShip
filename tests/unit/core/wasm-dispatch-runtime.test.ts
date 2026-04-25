import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { WASMDispatch, fallbackKernels } from '@czap/core';

function createMockWasmEnvironment() {
  const buffer = new ArrayBuffer(65_536);
  const memory = {
    buffer,
    grow: vi.fn(),
  } as unknown as WebAssembly.Memory;

  const exports = {
    memory,
    spring_curve: vi.fn((_stiffness: number, _damping: number, _mass: number, samples: number) => {
      const data = new Float32Array(buffer, 0, samples + 1);
      for (let i = 0; i <= samples; i++) {
        data[i] = samples === 0 ? 1 : i / samples;
      }
      return 0;
    }),
    batch_boundary_eval: vi.fn((thresholdsPtr: number, thresholdsLen: number, valuesPtr: number, valuesLen: number) => {
      const thresholds = new Float32Array(buffer, thresholdsPtr, thresholdsLen);
      const values = new Float32Array(buffer, valuesPtr, valuesLen);
      const resultPtr = 40_960;
      const out = new Uint32Array(buffer, resultPtr, valuesLen);

      for (let i = 0; i < valuesLen; i++) {
        let match = 0;
        for (let j = thresholdsLen - 1; j >= 0; j--) {
          if (values[i]! >= thresholds[j]!) {
            match = j;
            break;
          }
        }
        out[i] = match;
      }

      return resultPtr;
    }),
    blend_normalize: vi.fn((weightsPtr: number, len: number) => {
      const weights = new Float32Array(buffer, weightsPtr, len);
      let sum = 0;

      for (let i = 0; i < len; i++) {
        weights[i] = Math.max(0, weights[i]!);
        sum += weights[i]!;
      }

      if (sum === 0) return;

      for (let i = 0; i < len; i++) {
        weights[i] = weights[i]! / sum;
      }
    }),
  };

  return { exports };
}

describe('WASMDispatch runtime loading', () => {
  beforeEach(() => {
    WASMDispatch.unload();
  });

  afterEach(() => {
    WASMDispatch.unload();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test('detect returns false when WebAssembly is unavailable', () => {
    vi.stubGlobal('WebAssembly', undefined as never);
    expect(WASMDispatch.detect()).toBe(false);
  });

  test('detect returns false when WebAssembly access throws', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'WebAssembly');
    Object.defineProperty(globalThis, 'WebAssembly', {
      configurable: true,
      get() {
        throw new Error('blocked');
      },
    });

    try {
      expect(WASMDispatch.detect()).toBe(false);
    } finally {
      if (original) {
        Object.defineProperty(globalThis, 'WebAssembly', original);
      } else {
        delete (globalThis as { WebAssembly?: typeof WebAssembly }).WebAssembly;
      }
    }
  });

  test('load(string) fetches and installs wasm-backed kernels', async () => {
    const { exports } = createMockWasmEnvironment();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    }));
    const instantiateMock = vi.fn(async () => ({
      instance: { exports },
    }));

    vi.stubGlobal('fetch', fetchMock as never);
    vi.stubGlobal(
      'WebAssembly',
      {
        instantiate: instantiateMock,
        Module: function Module() {},
      } as unknown as typeof WebAssembly,
    );

    const kernels = await WASMDispatch.load('/czap-compute.wasm');

    expect(fetchMock).toHaveBeenCalledWith('/czap-compute.wasm');
    expect(instantiateMock).toHaveBeenCalledOnce();
    expect(WASMDispatch.isLoaded()).toBe(true);
    expect(WASMDispatch.kernels()).toBe(kernels);
    expect(Array.from(kernels.springCurve(170, 26, 1, 2))).toEqual([0, 0.5, 1]);
    expect(Array.from(kernels.batchBoundaryEval(new Float64Array([0, 10]), new Float64Array([5, 15])))).toEqual([0, 1]);

    const weights = new Float32Array([2, 6]);
    expect(Array.from(kernels.blendNormalize(weights))).toEqual([0.25, 0.75]);

    WASMDispatch.unload();
    expect(WASMDispatch.kernels()).toBe(fallbackKernels);
  });

  test('load(ArrayBuffer) bypasses fetch and still upgrades kernels', async () => {
    const { exports } = createMockWasmEnvironment();
    const fetchMock = vi.fn();

    vi.stubGlobal('fetch', fetchMock as never);
    vi.stubGlobal(
      'WebAssembly',
      {
        instantiate: vi.fn(async () => ({
          instance: { exports },
        })),
        Module: function Module() {},
      } as unknown as typeof WebAssembly,
    );

    await WASMDispatch.load(new ArrayBuffer(4));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(WASMDispatch.isLoaded()).toBe(true);
  });

  test('load(string) rejects when the wasm fetch fails', async () => {
    vi.stubGlobal(
      'WebAssembly',
      {
        instantiate: vi.fn(),
        Module: function Module() {},
      } as unknown as typeof WebAssembly,
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      })) as never,
    );

    await expect(WASMDispatch.load('/missing.wasm')).rejects.toThrow(/Failed to fetch WASM module/);
  });
});
