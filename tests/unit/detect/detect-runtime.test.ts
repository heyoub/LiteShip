// @vitest-environment jsdom
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { Effect } from 'effect';
import {
  Detect,
  detect,
  detectGPUTier,
  watchCapabilities,
} from '../../../packages/detect/src/detect.js';
import {
  capSetFromCapabilities,
  designTierFromCapabilities,
  motionTierFromCapabilities,
  tierFromCapabilities,
} from '../../../packages/detect/src/tiers.js';

type MockMediaQueryList = MediaQueryList & {
  dispatchChange(): void;
};

function setNavigatorProperty(name: string, value: unknown): void {
  Object.defineProperty(window.navigator, name, {
    configurable: true,
    value,
  });
}

function installMatchMedia(matches: Record<string, boolean>): Map<string, MockMediaQueryList> {
  const lists = new Map<string, MockMediaQueryList>();

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => {
    const listeners = new Set<(event: MediaQueryListEvent) => void>();
    const list = {
      matches: matches[query] ?? false,
      media: query,
      onchange: null,
      addListener(listener: (event: MediaQueryListEvent) => void) {
        listeners.add(listener);
      },
      removeListener(listener: (event: MediaQueryListEvent) => void) {
        listeners.delete(listener);
      },
      addEventListener(_type: string, listener: (event: MediaQueryListEvent) => void) {
        listeners.add(listener);
      },
      removeEventListener(_type: string, listener: (event: MediaQueryListEvent) => void) {
        listeners.delete(listener);
      },
      dispatchEvent() {
        return true;
      },
      dispatchChange() {
        for (const listener of listeners) {
          listener({ matches: list.matches, media: query } as MediaQueryListEvent);
        }
      },
    } as MockMediaQueryList;

    lists.set(query, list);
    return list;
    },
  });

  return lists;
}

function mockRenderer(renderer: string | null, useDebugRenderer = false): void {
  const gl = renderer
    ? {
        RENDERER: 'RENDERER',
        getParameter(key: unknown) {
          if (key === 'RENDERER' && !useDebugRenderer) {
            return renderer;
          }
          if (key === 'UNMASKED_RENDERER_WEBGL' && useDebugRenderer) {
            return renderer;
          }
          return '';
        },
        getExtension(name: string) {
          if (useDebugRenderer && name === 'WEBGL_debug_renderer_info') {
            return {
              UNMASKED_RENDERER_WEBGL: 'UNMASKED_RENDERER_WEBGL',
            };
          }
          return null;
        },
      }
    : null;

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((kind: string) => {
    if (kind === 'webgl' || kind === 'experimental-webgl') {
      return gl as never;
    }
    return null;
  });
}

describe('device detection runtime', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    installMatchMedia({});
    setNavigatorProperty('hardwareConcurrency', 8);
    setNavigatorProperty('deviceMemory', 8);
    setNavigatorProperty('maxTouchPoints', 0);
    setNavigatorProperty('connection', {
      effectiveType: '4g',
      downlink: 12,
      saveData: false,
    });
    setNavigatorProperty('gpu', {});
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  test('classifies GPU renderers through direct, debug, and fallback paths', () => {
    mockRenderer('ANGLE (NVIDIA GeForce RTX 4090)');
    expect(Effect.runSync(detectGPUTier())).toBe(3);

    mockRenderer('Google SwiftShader', true);
    expect(Effect.runSync(detectGPUTier())).toBe(0);

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      throw new Error('no-webgl');
    });
    expect(Effect.runSync(detectGPUTier())).toBe(1);
  });

  test('detect() collects capabilities, infers tiers, and preserves graceful defaults', () => {
    installMatchMedia({
      '(prefers-reduced-motion: reduce)': false,
      '(prefers-color-scheme: dark)': true,
      '(prefers-contrast: more)': false,
      '(prefers-contrast: less)': false,
      '(prefers-contrast: custom)': false,
      '(forced-colors: active)': false,
      '(prefers-reduced-transparency: reduce)': false,
      '(dynamic-range: high)': true,
      '(color-gamut: rec2020)': false,
      '(color-gamut: p3)': true,
      '(update: none)': false,
      '(update: slow)': false,
    });

    mockRenderer('Apple M3');

    const result = Effect.runSync(detect());

    expect(result.capabilities).toMatchObject({
      gpu: 3,
      cores: 8,
      memory: 8,
      webgpu: true,
      touchPrimary: true,
      prefersReducedMotion: false,
      prefersColorScheme: 'dark',
      viewportWidth: 1440,
      viewportHeight: 900,
      devicePixelRatio: 2,
      prefersContrast: 'no-preference',
      forcedColors: false,
      prefersReducedTransparency: false,
      dynamicRange: 'high',
      colorGamut: 'p3',
      updateRate: 'fast',
    });
    expect(result.capabilities.connection).toEqual({
      effectiveType: '4g',
      downlink: 12,
      saveData: false,
    });
    expect(result.tier).toBe('gpu');
    expect(result.capSet.levels.has('gpu')).toBe(true);
    expect(result.designTier).toBe('rich');
    expect(result.motionTier).toBe('compute');
    expect(result.confidence).toBeCloseTo(1, 10);

    setNavigatorProperty('connection', undefined);
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => {
        throw new Error('blocked');
      },
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null as never);

    const fallback = Effect.runSync(Detect.detect());
    expect(fallback.capabilities.gpu).toBe(1);
    expect(fallback.capabilities.prefersColorScheme).toBe('light');
    expect(fallback.capabilities.prefersReducedMotion).toBe(false);
    expect(fallback.capabilities.connection).toBeUndefined();
    expect(fallback.confidence).toBe(0.7);
  });

  test('detect() covers custom preference branches, connection defaults, and unknown renderers', () => {
    installMatchMedia({
      '(prefers-reduced-motion: reduce)': false,
      '(prefers-color-scheme: dark)': false,
      '(prefers-contrast: more)': false,
      '(prefers-contrast: less)': false,
      '(prefers-contrast: custom)': true,
      '(forced-colors: active)': false,
      '(prefers-reduced-transparency: reduce)': true,
      '(dynamic-range: high)': false,
      '(color-gamut: rec2020)': true,
      '(color-gamut: p3)': false,
      '(update: none)': true,
      '(update: slow)': false,
    });

    mockRenderer('Mystery Accelerator 1000');
    setNavigatorProperty('connection', {
      effectiveType: undefined,
      downlink: undefined,
      saveData: undefined,
    });
    setNavigatorProperty('gpu', undefined);
    setNavigatorProperty('maxTouchPoints', 0);

    const result = Effect.runSync(detect());

    expect(result.capabilities.gpu).toBe(1);
    expect(result.capabilities.webgpu).toBe(false);
    expect(result.capabilities.prefersContrast).toBe('custom');
    expect(result.capabilities.prefersReducedTransparency).toBe(true);
    expect(result.capabilities.dynamicRange).toBe('standard');
    expect(result.capabilities.colorGamut).toBe('rec2020');
    expect(result.capabilities.updateRate).toBe('none');
    expect(result.capabilities.connection).toEqual({
      effectiveType: '4g',
      downlink: 10,
      saveData: false,
    });
  });

  test('detect() covers navigator and viewport fallback defaults plus less-contrast and slow-update branches', () => {
    installMatchMedia({
      '(prefers-reduced-motion: reduce)': false,
      '(prefers-color-scheme: dark)': false,
      '(prefers-contrast: more)': false,
      '(prefers-contrast: less)': true,
      '(prefers-contrast: custom)': false,
      '(forced-colors: active)': false,
      '(prefers-reduced-transparency: reduce)': false,
      '(dynamic-range: high)': false,
      '(color-gamut: rec2020)': false,
      '(color-gamut: p3)': false,
      '(update: none)': false,
      '(update: slow)': true,
    });

    setNavigatorProperty('hardwareConcurrency', undefined);
    setNavigatorProperty('deviceMemory', undefined);
    setNavigatorProperty('maxTouchPoints', 0);
    setNavigatorProperty('connection', undefined);
    setNavigatorProperty('gpu', undefined);
    vi.stubGlobal('innerWidth', undefined as never);
    vi.stubGlobal('innerHeight', undefined as never);
    vi.stubGlobal('devicePixelRatio', undefined as never);
    mockRenderer('');

    const result = Effect.runSync(detect());

    expect(result.capabilities.cores).toBe(2);
    expect(result.capabilities.memory).toBe(4);
    expect(result.capabilities.prefersContrast).toBe('less');
    expect(result.capabilities.updateRate).toBe('slow');
    expect(result.capabilities.viewportWidth).toBe(1920);
    expect(result.capabilities.viewportHeight).toBe(1080);
    expect(result.capabilities.devicePixelRatio).toBe(1);
  });

  test('detect() treats empty debug renderer strings as unavailable instead of trusted renderer data', () => {
    installMatchMedia({
      '(prefers-reduced-motion: reduce)': false,
      '(prefers-color-scheme: dark)': false,
      '(prefers-contrast: more)': false,
      '(prefers-contrast: less)': false,
      '(prefers-contrast: custom)': false,
      '(forced-colors: active)': false,
      '(prefers-reduced-transparency: reduce)': false,
      '(dynamic-range: high)': false,
      '(color-gamut: rec2020)': false,
      '(color-gamut: p3)': false,
      '(update: none)': false,
      '(update: slow)': false,
    });

    const gl = {
      RENDERER: 'RENDERER',
      getParameter(key: unknown) {
        if (key === 'RENDERER') return '';
        if (key === 'UNMASKED_RENDERER_WEBGL') return '';
        return '';
      },
      getExtension(name: string) {
        if (name === 'WEBGL_debug_renderer_info') {
          return { UNMASKED_RENDERER_WEBGL: 'UNMASKED_RENDERER_WEBGL' };
        }
        return null;
      },
    };

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((kind: string) => {
      if (kind === 'webgl' || kind === 'experimental-webgl') {
        return gl as never;
      }
      return null;
    });

    const result = Effect.runSync(detect());

    expect(result.capabilities.gpu).toBe(1);
    expect(result.confidence).toBeCloseTo(0.8, 10);
  });

  test('falls back to experimental-webgl when standard webgl context is unavailable', () => {
    installMatchMedia({});

    const gl = {
      RENDERER: 'RENDERER',
      isContextLost: () => false,
      getParameter(key: unknown) {
        if (key === 'RENDERER') return 'Experimental WebGL Renderer';
        return '';
      },
      getExtension() {
        return null;
      },
    };

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((kind: string) => {
      if (kind === 'experimental-webgl') return gl as never;
      return null;
    });

    const result = Effect.runSync(detect());
    expect(result.capabilities.gpu).toBeGreaterThanOrEqual(1);
  });

  test('treats experimental-webgl context without isContextLost as unavailable', () => {
    installMatchMedia({});

    const notActuallyWebGL = {
      RENDERER: 'RENDERER',
      getParameter() {
        return 'shouldnt-be-used';
      },
      getExtension() {
        return null;
      },
    };

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((kind: string) => {
      if (kind === 'experimental-webgl') return notActuallyWebGL as never;
      return null;
    });

    const result = Effect.runSync(detect());
    // No valid GL context → renderer probe returns unavailable, gpu stays at the default.
    expect(result.capabilities.gpu).toBe(1);
  });

  test('maps tiers, cap sets, design tiers, and motion tiers across edge cases', () => {
    expect(
      tierFromCapabilities({
        gpu: 0,
        cores: 2,
        memory: 2,
        webgpu: false,
        touchPrimary: true,
        prefersReducedMotion: true,
        prefersColorScheme: 'light',
        viewportWidth: 375,
        viewportHeight: 812,
        devicePixelRatio: 2,
      }),
    ).toBe('static');

    expect(
      tierFromCapabilities({
        gpu: 1,
        cores: 4,
        memory: 8,
        webgpu: false,
        touchPrimary: false,
        prefersReducedMotion: false,
        prefersColorScheme: 'dark',
        viewportWidth: 1280,
        viewportHeight: 720,
        devicePixelRatio: 1,
      }),
    ).toBe('reactive');

    expect(
      tierFromCapabilities({
        gpu: 0,
        cores: 4,
        memory: 8,
        webgpu: false,
        touchPrimary: false,
        prefersReducedMotion: false,
        prefersColorScheme: 'light',
        viewportWidth: 1024,
        viewportHeight: 768,
        devicePixelRatio: 1,
      }),
    ).toBe('styled');

    expect(
      tierFromCapabilities({
        gpu: 3,
        cores: 8,
        memory: 16,
        webgpu: false,
        touchPrimary: false,
        prefersReducedMotion: false,
        prefersColorScheme: 'dark',
        viewportWidth: 1600,
        viewportHeight: 900,
        devicePixelRatio: 2,
      }),
    ).toBe('animated');

    const capSet = capSetFromCapabilities({
      gpu: 2,
      cores: 6,
      memory: 8,
      webgpu: false,
      touchPrimary: false,
      prefersReducedMotion: false,
      prefersColorScheme: 'light',
      viewportWidth: 1280,
      viewportHeight: 720,
      devicePixelRatio: 1,
    });
    expect([...capSet.levels]).toEqual(['static', 'styled', 'reactive', 'animated']);

    expect(
      designTierFromCapabilities({
        gpu: 2,
        cores: 4,
        memory: 8,
        webgpu: false,
        touchPrimary: false,
        prefersReducedMotion: false,
        prefersColorScheme: 'light',
        viewportWidth: 1280,
        viewportHeight: 720,
        devicePixelRatio: 1,
        prefersContrast: 'no-preference',
        forcedColors: true,
        prefersReducedTransparency: false,
        dynamicRange: 'standard',
        colorGamut: 'srgb',
        updateRate: 'fast',
      }),
    ).toBe('minimal');

    expect(
      designTierFromCapabilities({
        gpu: 2,
        cores: 4,
        memory: 8,
        webgpu: false,
        touchPrimary: false,
        prefersReducedMotion: false,
        prefersColorScheme: 'light',
        viewportWidth: 1280,
        viewportHeight: 720,
        devicePixelRatio: 1,
        prefersContrast: 'no-preference',
        forcedColors: false,
        prefersReducedTransparency: false,
        dynamicRange: 'standard',
        colorGamut: 'srgb',
        updateRate: 'fast',
      }),
    ).toBe('enhanced');

    expect(
      motionTierFromCapabilities({
        gpu: 0,
        cores: 2,
        memory: 2,
        webgpu: false,
        touchPrimary: true,
        prefersReducedMotion: false,
        prefersColorScheme: 'light',
        viewportWidth: 375,
        viewportHeight: 812,
        devicePixelRatio: 2,
        prefersContrast: 'less',
        forcedColors: false,
        prefersReducedTransparency: true,
        dynamicRange: 'standard',
        colorGamut: 'srgb',
        updateRate: 'slow',
      }),
    ).toBe('transitions');

    expect(
      motionTierFromCapabilities({
        gpu: 3,
        cores: 8,
        memory: 16,
        webgpu: true,
        touchPrimary: false,
        prefersReducedMotion: false,
        prefersColorScheme: 'dark',
        viewportWidth: 1440,
        viewportHeight: 900,
        devicePixelRatio: 2,
        prefersContrast: 'more',
        forcedColors: false,
        prefersReducedTransparency: false,
        dynamicRange: 'high',
        colorGamut: 'p3',
        updateRate: 'fast',
      }),
    ).toBe('compute');

    expect(
      tierFromCapabilities({
        gpu: 3,
        cores: 8,
        memory: 16,
        webgpu: false,
        touchPrimary: false,
        prefersReducedMotion: true,
        prefersColorScheme: 'dark',
        viewportWidth: 1920,
        viewportHeight: 1080,
        devicePixelRatio: 2,
      }),
    ).toBe('reactive');
  });

  test('covers reduced-motion and low-resource tier fallbacks across the mapping helpers', () => {
    expect(
      tierFromCapabilities({
        gpu: 1,
        cores: 2,
        memory: 2,
        webgpu: false,
        touchPrimary: false,
        prefersReducedMotion: true,
        prefersColorScheme: 'light',
        viewportWidth: 1024,
        viewportHeight: 768,
        devicePixelRatio: 1,
      }),
    ).toBe('static');

    expect(
      tierFromCapabilities({
        gpu: 0,
        cores: 2,
        memory: 2,
        webgpu: false,
        touchPrimary: false,
        prefersReducedMotion: false,
        prefersColorScheme: 'light',
        viewportWidth: 1024,
        viewportHeight: 768,
        devicePixelRatio: 1,
      }),
    ).toBe('styled');

    expect(
      tierFromCapabilities({
        gpu: 2,
        cores: 2,
        memory: 2,
        webgpu: false,
        touchPrimary: false,
        prefersReducedMotion: false,
        prefersColorScheme: 'light',
        viewportWidth: 1024,
        viewportHeight: 768,
        devicePixelRatio: 1,
      }),
    ).toBe('reactive');

    expect(
      tierFromCapabilities({
        gpu: 3,
        cores: 8,
        memory: 8,
        webgpu: true,
        touchPrimary: false,
        prefersReducedMotion: true,
        prefersColorScheme: 'light',
        viewportWidth: 1440,
        viewportHeight: 900,
        devicePixelRatio: 2,
      }),
    ).toBe('animated');

    expect(
      designTierFromCapabilities({
        gpu: 1,
        cores: 2,
        memory: 4,
        webgpu: false,
        touchPrimary: false,
        prefersReducedMotion: false,
        prefersColorScheme: 'light',
        viewportWidth: 1024,
        viewportHeight: 768,
        devicePixelRatio: 1,
        prefersContrast: 'more',
        forcedColors: false,
        prefersReducedTransparency: true,
        dynamicRange: 'standard',
        colorGamut: 'srgb',
        updateRate: 'slow',
      }),
    ).toBe('standard');

    expect(
      motionTierFromCapabilities({
        gpu: 1,
        cores: 2,
        memory: 4,
        webgpu: false,
        touchPrimary: false,
        prefersReducedMotion: false,
        prefersColorScheme: 'light',
        viewportWidth: 1024,
        viewportHeight: 768,
        devicePixelRatio: 1,
        prefersContrast: 'no-preference',
        forcedColors: false,
        prefersReducedTransparency: false,
        dynamicRange: 'standard',
        colorGamut: 'srgb',
        updateRate: 'fast',
      }),
    ).toBe('transitions');

    expect(
      motionTierFromCapabilities({
        gpu: 2,
        cores: 2,
        memory: 4,
        webgpu: false,
        touchPrimary: false,
        prefersReducedMotion: false,
        prefersColorScheme: 'light',
        viewportWidth: 1024,
        viewportHeight: 768,
        devicePixelRatio: 1,
        prefersContrast: 'no-preference',
        forcedColors: false,
        prefersReducedTransparency: false,
        dynamicRange: 'standard',
        colorGamut: 'srgb',
        updateRate: 'fast',
      }),
    ).toBe('animations');

    expect(
      motionTierFromCapabilities({
        gpu: 3,
        cores: 8,
        memory: 8,
        webgpu: false,
        touchPrimary: false,
        prefersReducedMotion: false,
        prefersColorScheme: 'light',
        viewportWidth: 1440,
        viewportHeight: 900,
        devicePixelRatio: 2,
        prefersContrast: 'no-preference',
        forcedColors: false,
        prefersReducedTransparency: false,
        dynamicRange: 'high',
        colorGamut: 'p3',
        updateRate: 'fast',
      }),
    ).toBe('physics');
  });

  test('watchCapabilities reacts to resize and media-query changes and cleans up listeners', async () => {
    const queries = installMatchMedia({
      '(prefers-reduced-motion: reduce)': false,
      '(prefers-color-scheme: dark)': false,
      '(prefers-contrast: more)': false,
      '(forced-colors: active)': false,
      '(prefers-reduced-transparency: reduce)': false,
      '(update: none)': false,
      '(update: slow)': false,
      '(dynamic-range: high)': false,
      '(color-gamut: rec2020)': false,
      '(color-gamut: p3)': false,
      '(prefers-contrast: less)': false,
      '(prefers-contrast: custom)': false,
    });
    mockRenderer('Intel Iris Xe');

    const onChange = vi.fn();

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          yield* watchCapabilities(onChange);

          window.dispatchEvent(new Event('resize'));
          queries.get('(prefers-color-scheme: dark)')!.matches = true;
          queries.get('(prefers-color-scheme: dark)')!.dispatchChange();
          yield* Effect.promise(() => Promise.resolve());
        }),
      ),
    );

    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.calls[0]?.[0].tier).toBeDefined();
  });

  test('watchCapabilities short-circuits cleanly when window is unavailable', async () => {
    const onChange = vi.fn();
    vi.stubGlobal('window', undefined);

    await Effect.runPromise(Effect.scoped(watchCapabilities(onChange)));

    expect(onChange).not.toHaveBeenCalled();
  });

  test('detect and gpu-tier probes fall back cleanly when browser globals are unavailable', () => {
    vi.stubGlobal('window', undefined);
    vi.stubGlobal('document', undefined);
    vi.stubGlobal('navigator', undefined);

    const result = Effect.runSync(detect());

    expect(result.capabilities).toMatchObject({
      gpu: 1,
      cores: 2,
      memory: 4,
      webgpu: false,
      touchPrimary: false,
      prefersReducedMotion: false,
      prefersColorScheme: 'light',
      viewportWidth: 1920,
      viewportHeight: 1080,
      devicePixelRatio: 1,
      prefersContrast: 'no-preference',
      forcedColors: false,
      prefersReducedTransparency: false,
      dynamicRange: 'standard',
      colorGamut: 'srgb',
      updateRate: 'fast',
    });
    expect(result.capabilities.connection).toBeUndefined();
    expect(result.confidence).toBe(0.5);
    expect(Effect.runSync(detectGPUTier())).toBe(1);
  });

  test('tier helpers cover low, mid, and reduced-motion branch splits', () => {
    expect(
      tierFromCapabilities({
        gpu: 0,
        cores: 2,
        memory: 2,
        webgpu: false,
        touchPrimary: false,
        prefersReducedMotion: true,
        prefersColorScheme: 'light',
        viewportWidth: 800,
        viewportHeight: 600,
        devicePixelRatio: 1,
      }),
    ).toBe('static');

    expect(
      tierFromCapabilities({
        gpu: 1,
        cores: 2,
        memory: 2,
        webgpu: false,
        touchPrimary: false,
        prefersReducedMotion: false,
        prefersColorScheme: 'light',
        viewportWidth: 800,
        viewportHeight: 600,
        devicePixelRatio: 1,
      }),
    ).toBe('styled');

    expect(
      tierFromCapabilities({
        gpu: 2,
        cores: 2,
        memory: 2,
        webgpu: false,
        touchPrimary: false,
        prefersReducedMotion: true,
        prefersColorScheme: 'light',
        viewportWidth: 800,
        viewportHeight: 600,
        devicePixelRatio: 1,
      }),
    ).toBe('reactive');

    expect(
      motionTierFromCapabilities({
        gpu: 1,
        cores: 2,
        memory: 4,
        webgpu: false,
        touchPrimary: false,
        prefersReducedMotion: false,
        prefersColorScheme: 'light',
        viewportWidth: 800,
        viewportHeight: 600,
        devicePixelRatio: 1,
        prefersContrast: 'no-preference',
        forcedColors: false,
        prefersReducedTransparency: true,
        dynamicRange: 'standard',
        colorGamut: 'srgb',
        updateRate: 'fast',
      }),
    ).toBe('transitions');

    expect(
      designTierFromCapabilities({
        gpu: 2,
        cores: 8,
        memory: 8,
        webgpu: false,
        touchPrimary: false,
        prefersReducedMotion: false,
        prefersColorScheme: 'light',
        viewportWidth: 1280,
        viewportHeight: 720,
        devicePixelRatio: 2,
        prefersContrast: 'more',
        forcedColors: false,
        prefersReducedTransparency: false,
        dynamicRange: 'standard',
        colorGamut: 'srgb',
        updateRate: 'slow',
      }),
    ).toBe('standard');
  });
});
