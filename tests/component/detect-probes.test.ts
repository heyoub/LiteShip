// @vitest-environment jsdom
/**
 * Component test: Device capability detection probes.
 *
 * Tests GPU tier classification, detect() sweep, individual probes,
 * confidence scoring, and watchCapabilities lifecycle.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { Effect } from 'effect';
import { detect, detectGPUTier, watchCapabilities } from '@czap/detect';
import {
  mockNavigator,
  mockMatchMedia,
  mockWebGL,
  mockViewport,
  type MockNavigatorOverrides,
} from '../helpers/mock-browser.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const run = <A>(effect: Effect.Effect<A>): A => Effect.runSync(effect);

let restoreNav: (() => void) | undefined;
let restoreMM: (() => void) | undefined;
let restoreGL: (() => void) | undefined;
let restoreVP: (() => void) | undefined;

afterEach(() => {
  restoreNav?.();
  restoreMM?.();
  restoreGL?.();
  restoreVP?.();
  restoreNav = restoreMM = restoreGL = restoreVP = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function defineThrowingGetter(target: object, property: string, message = 'restricted'): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(target, property);

  Object.defineProperty(target, property, {
    configurable: true,
    get() {
      throw new Error(message);
    },
  });

  return () => {
    if (descriptor) {
      Object.defineProperty(target, property, descriptor);
      return;
    }

    Reflect.deleteProperty(target, property);
  };
}

// ---------------------------------------------------------------------------
// GPU Tier Classification
// ---------------------------------------------------------------------------

describe('GPU tier detection', () => {
  test('tier 0 for software renderers', () => {
    restoreGL = mockWebGL('SwiftShader');
    const tier = run(detectGPUTier());
    expect(tier).toBe(0);
  });

  test('tier 0 for llvmpipe', () => {
    restoreGL = mockWebGL('Mesa DRI Intel(R) -- llvmpipe');
    const tier = run(detectGPUTier());
    expect(tier).toBe(0);
  });

  test('tier 1 for Intel HD', () => {
    restoreGL = mockWebGL('Intel(R) HD Graphics 630');
    const tier = run(detectGPUTier());
    expect(tier).toBe(1);
  });

  test('tier 1 for Apple GPU', () => {
    restoreGL = mockWebGL('Apple GPU');
    const tier = run(detectGPUTier());
    expect(tier).toBe(1);
  });

  test('tier 2 for Intel Arc', () => {
    restoreGL = mockWebGL('Intel Arc A770');
    const tier = run(detectGPUTier());
    expect(tier).toBe(2);
  });

  test('tier 2 for Apple M1', () => {
    restoreGL = mockWebGL('Apple M1 Pro');
    const tier = run(detectGPUTier());
    expect(tier).toBe(2);
  });

  test('tier 3 for RTX GPU', () => {
    restoreGL = mockWebGL('NVIDIA GeForce RTX 4090');
    const tier = run(detectGPUTier());
    expect(tier).toBe(3);
  });

  test('tier 3 for Apple M3', () => {
    restoreGL = mockWebGL('Apple M3 Max');
    const tier = run(detectGPUTier());
    expect(tier).toBe(3);
  });

  test('tier 1 fallback for unknown renderer', () => {
    restoreGL = mockWebGL('Some Unknown GPU');
    const tier = run(detectGPUTier());
    expect(tier).toBe(1);
  });

  test('tier 1 fallback when WebGL unavailable', () => {
    // No mockWebGL — jsdom has no real WebGL
    const tier = run(detectGPUTier());
    expect(tier).toBe(1);
  });
  test('tier 1 fallback when WebGL exposes no renderer strings', () => {
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
      if (tagName !== 'canvas') {
        return originalCreateElement(tagName);
      }

      return {
        getContext: () => ({
          RENDERER: 0,
          getParameter: () => null,
          getExtension: () => null,
        }),
      } as unknown as HTMLCanvasElement;
    }) as typeof document.createElement);

    const tier = run(detectGPUTier());
    expect(tier).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Full detect() sweep
// ---------------------------------------------------------------------------

describe('detect()', () => {
  test('returns complete capability set', () => {
    restoreNav = mockNavigator({ hardwareConcurrency: 8, deviceMemory: 16 });
    restoreVP = mockViewport(1920, 1080, 2);

    const result = run(detect());

    expect(result.capabilities).toBeDefined();
    expect(result.tier).toBeDefined();
    expect(result.capSet).toBeDefined();
    expect(result.confidence).toBeGreaterThanOrEqual(0.5);
    expect(result.confidence).toBeLessThanOrEqual(1.0);
    expect(result.designTier).toBeDefined();
    expect(result.motionTier).toBeDefined();
  });

  test('detects CPU cores', () => {
    restoreNav = mockNavigator({ hardwareConcurrency: 16 });
    const result = run(detect());
    expect(result.capabilities.cores).toBe(16);
  });

  test('detects device memory', () => {
    restoreNav = mockNavigator({ deviceMemory: 32 });
    const result = run(detect());
    expect(result.capabilities.memory).toBe(32);
  });

  test('detects touch capability', () => {
    restoreNav = mockNavigator({ maxTouchPoints: 5 });
    const result = run(detect());
    expect(result.capabilities.touchPrimary).toBe(true);
  });

  test('detects touch capability from ontouchstart even when navigator reports no touch points', () => {
    restoreNav = mockNavigator({ maxTouchPoints: 0 });
    (window as Window & { ontouchstart?: unknown }).ontouchstart = null;

    const result = run(detect());
    expect(result.capabilities.touchPrimary).toBe(true);
  });

  test('no touch when maxTouchPoints is 0 and no ontouchstart', () => {
    restoreNav = mockNavigator({ maxTouchPoints: 0 });
    // jsdom may have ontouchstart on window — remove it for this test
    const hadTouch = 'ontouchstart' in window;
    if (hadTouch) {
      delete (window as any).ontouchstart;
    }
    const result = run(detect());
    expect(result.capabilities.touchPrimary).toBe(false);
    if (hadTouch) {
      (window as any).ontouchstart = null;
    }
  });

  test('detects viewport dimensions', () => {
    restoreVP = mockViewport(768, 1024, 2);
    const result = run(detect());
    expect(result.capabilities.viewportWidth).toBe(768);
    expect(result.capabilities.viewportHeight).toBe(1024);
    expect(result.capabilities.devicePixelRatio).toBe(2);
  });

  test('detects connection info', () => {
    restoreNav = mockNavigator({
      connection: { effectiveType: '3g', downlink: 1.5, saveData: true },
    });
    const result = run(detect());
    expect(result.capabilities.connection).toBeDefined();
    expect(result.capabilities.connection!.effectiveType).toBe('3g');
    expect(result.capabilities.connection!.downlink).toBe(1.5);
    expect(result.capabilities.connection!.saveData).toBe(true);
  });

  test('fills connection defaults when partial connection data is exposed', () => {
    restoreNav = mockNavigator({
      connection: { effectiveType: '4g' } as MockNavigatorOverrides['connection'],
    });

    const result = run(detect());
    expect(result.capabilities.connection).toEqual({
      effectiveType: '4g',
      downlink: 10,
      saveData: false,
    });
  });
});

// ---------------------------------------------------------------------------
// Media preference probes
// ---------------------------------------------------------------------------

describe('detect() media preferences', () => {
  test('detects prefers-reduced-motion', () => {
    restoreMM = mockMatchMedia({
      '(prefers-reduced-motion: reduce)': true,
    });
    const result = run(detect());
    expect(result.capabilities.prefersReducedMotion).toBe(true);
  });

  test('detects dark color scheme', () => {
    restoreMM = mockMatchMedia({
      '(prefers-color-scheme: dark)': true,
    });
    const result = run(detect());
    expect(result.capabilities.prefersColorScheme).toBe('dark');
  });

  test('detects light color scheme by default', () => {
    restoreMM = mockMatchMedia({});
    const result = run(detect());
    expect(result.capabilities.prefersColorScheme).toBe('light');
  });

  test('detects high contrast preference', () => {
    restoreMM = mockMatchMedia({
      '(prefers-contrast: more)': true,
    });
    const result = run(detect());
    expect(result.capabilities.prefersContrast).toBe('more');
  });

  test('detects forced colors', () => {
    restoreMM = mockMatchMedia({
      '(forced-colors: active)': true,
    });
    const result = run(detect());
    expect(result.capabilities.forcedColors).toBe(true);
  });

  test('detects high dynamic range', () => {
    restoreMM = mockMatchMedia({
      '(dynamic-range: high)': true,
    });
    const result = run(detect());
    expect(result.capabilities.dynamicRange).toBe('high');
  });

  test('detects P3 color gamut', () => {
    restoreMM = mockMatchMedia({
      '(color-gamut: p3)': true,
    });
    const result = run(detect());
    expect(result.capabilities.colorGamut).toBe('p3');
  });

  test('detects rec2020 color gamut over p3', () => {
    restoreMM = mockMatchMedia({
      '(color-gamut: rec2020)': true,
      '(color-gamut: p3)': true,
    });
    const result = run(detect());
    expect(result.capabilities.colorGamut).toBe('rec2020');
  });

  test('falls back to conservative defaults when matchMedia throws', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => {
      throw new Error('blocked');
    }) as never);

    const result = run(detect());

    expect(result.capabilities.prefersReducedMotion).toBe(false);
    expect(result.capabilities.prefersColorScheme).toBe('light');
    expect(result.capabilities.prefersContrast).toBe('no-preference');
    expect(result.capabilities.forcedColors).toBe(false);
    expect(result.capabilities.dynamicRange).toBe('standard');
    expect(result.capabilities.colorGamut).toBe('srgb');
    expect(result.capabilities.updateRate).toBe('fast');
  });

  test.each([
    {
      name: 'webgpu getter failures',
      install() {
        restoreNav = mockNavigator({ gpu: true });
        return defineThrowingGetter(globalThis.navigator as object, 'gpu');
      },
      assert(result: ReturnType<typeof run>) {
        expect(result.capabilities.webgpu).toBe(false);
      },
    },
    {
      name: 'hardwareConcurrency getter failures',
      install() {
        restoreNav = mockNavigator({ hardwareConcurrency: 8 });
        return defineThrowingGetter(globalThis.navigator as object, 'hardwareConcurrency');
      },
      assert(result: ReturnType<typeof run>) {
        expect(result.capabilities.cores).toBe(2);
      },
    },
    {
      name: 'deviceMemory getter failures',
      install() {
        restoreNav = mockNavigator({ deviceMemory: 16 });
        return defineThrowingGetter(globalThis.navigator as object, 'deviceMemory');
      },
      assert(result: ReturnType<typeof run>) {
        expect(result.capabilities.memory).toBe(4);
      },
    },
    {
      name: 'touch capability probe failures',
      install() {
        restoreNav = mockNavigator({ maxTouchPoints: 5 });
        const throwingWindow = new Proxy(window, {
          has(target, property) {
            if (property === 'ontouchstart') {
              throw new Error('restricted');
            }
            return Reflect.has(target, property);
          },
        });
        vi.stubGlobal('window', throwingWindow as never);
        return () => undefined;
      },
      assert(result: ReturnType<typeof run>) {
        expect(result.capabilities.touchPrimary).toBe(false);
      },
    },
    {
      name: 'viewport probe failures',
      install() {
        return defineThrowingGetter(window, 'innerWidth');
      },
      assert(result: ReturnType<typeof run>) {
        expect(result.capabilities.viewportWidth).toBe(1920);
        expect(result.capabilities.viewportHeight).toBe(1080);
      },
    },
    {
      name: 'devicePixelRatio getter failures',
      install() {
        return defineThrowingGetter(window, 'devicePixelRatio');
      },
      assert(result: ReturnType<typeof run>) {
        expect(result.capabilities.devicePixelRatio).toBe(1);
      },
    },
    {
      name: 'connection getter failures',
      install() {
        restoreNav = mockNavigator({
          connection: { effectiveType: '4g', downlink: 10, saveData: false },
        });
        return defineThrowingGetter(globalThis.navigator as object, 'connection');
      },
      assert(result: ReturnType<typeof run>) {
        expect(result.capabilities.connection).toBeUndefined();
      },
    },
  ])('falls back cleanly when %s throw inside detection probes', ({ install, assert }) => {
    const cleanup = install();

    try {
      const result = run(detect());
      assert(result);
    } finally {
      cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// Confidence scoring
// ---------------------------------------------------------------------------

describe('detect() confidence', () => {
  test('base confidence without WebGL is at most 0.8', () => {
    // No WebGL renderer — confidence misses the +0.2 WebGL bonus
    restoreNav = mockNavigator({ hardwareConcurrency: 4 });
    const result = run(detect());
    expect(result.confidence).toBeLessThanOrEqual(0.8);
    expect(result.confidence).toBeGreaterThanOrEqual(0.5);
  });

  test('WebGL renderer adds 0.2 confidence', () => {
    restoreGL = mockWebGL('Intel HD Graphics');
    restoreNav = mockNavigator({ hardwareConcurrency: 0 });
    const result = run(detect());
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
  });

  test('all probes present gives high confidence', () => {
    restoreGL = mockWebGL('Intel HD Graphics');
    restoreNav = mockNavigator({
      hardwareConcurrency: 8,
      deviceMemory: 16,
      connection: { effectiveType: '4g', downlink: 10, saveData: false },
    });
    const result = run(detect());
    expect(result.confidence).toBeCloseTo(1.0, 10);
  });
});

// ---------------------------------------------------------------------------
// watchCapabilities
// ---------------------------------------------------------------------------

describe('watchCapabilities', () => {
  test('calls onChange when resize event fires', async () => {
    restoreNav = mockNavigator({ hardwareConcurrency: 4 });
    restoreMM = mockMatchMedia({});

    const results: any[] = [];

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          yield* watchCapabilities((result) => results.push(result));

          // Simulate resize
          window.dispatchEvent(new Event('resize'));
        }),
      ),
    );

    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].capabilities).toBeDefined();
  });
});
