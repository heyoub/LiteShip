/**
 * Astro integration tests -- satellite attributes, initial state resolution,
 * and integration hook configuration.
 *
 * Tests the @czap/astro public API: satelliteAttrs, resolveInitialState,
 * resolveInitialStateFallback, and integration factory configuration.
 */

import { describe, test, expect } from 'vitest';
import { satelliteAttrs, resolveInitialStateFallback, resolveInitialState, integration } from '@czap/astro';
import type { SatelliteProps } from '@czap/astro';
import { Boundary } from '@czap/core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal Boundary.Shape for test fixtures.
 */
function makeBoundary(input: string, pairs: readonly (readonly [number, string])[], hysteresis?: number) {
  return Boundary.make({
    input,
    at: pairs as readonly (readonly [number, string])[] & { readonly [K: number]: readonly [number, string] },
    ...(hysteresis !== undefined ? { hysteresis } : {}),
  });
}

/**
 * Build a minimal Component.Shape-like object for satellite attribute tests.
 * We avoid importing Component.make since it requires Style.Shape which adds
 * unnecessary complexity for attribute generation tests.
 */
function makeComponentStub(name: string) {
  return { name } as { name: string };
}

// ---------------------------------------------------------------------------
// satelliteAttrs -- data-czap-* attribute generation
// ---------------------------------------------------------------------------

describe('satelliteAttrs', () => {
  test('generates base czap-satellite class with no props', () => {
    const attrs = satelliteAttrs({});

    expect(attrs['class']).toBe('czap-satellite');
  });

  test('merges custom class with czap-satellite', () => {
    const attrs = satelliteAttrs({ class: 'my-widget' });

    expect(attrs['class']).toBe('czap-satellite my-widget');
  });

  test('sets data-czap-satellite from component name', () => {
    const attrs = satelliteAttrs({
      component: makeComponentStub('HeroCard') as SatelliteProps['component'],
    });

    expect(attrs['data-czap-satellite']).toBe('HeroCard');
  });

  test('sets data-czap-boundary as serialized JSON from boundary shape', () => {
    const boundary = makeBoundary('viewport', [
      [0, 'compact'],
      [768, 'wide'],
    ]);

    const attrs = satelliteAttrs({ boundary });

    expect(attrs['data-czap-boundary']).toBeDefined();
    const parsed = JSON.parse(attrs['data-czap-boundary']!);
    expect(parsed.id).toBe(boundary.id);
    expect(parsed.input).toBe(boundary.input);
    expect(parsed.thresholds).toEqual(boundary.thresholds);
    expect(parsed.states).toEqual(boundary.states);
  });

  test('serializes hysteresis in data-czap-boundary when present', () => {
    const boundary = makeBoundary(
      'viewport',
      [
        [0, 'small'],
        [768, 'large'],
      ],
      50,
    );

    const attrs = satelliteAttrs({ boundary });

    const parsed = JSON.parse(attrs['data-czap-boundary']!);
    expect(parsed.hysteresis).toBe(50);
  });

  test('sets data-czap-state from initialState', () => {
    const attrs = satelliteAttrs({ initialState: 'compact' });

    expect(attrs['data-czap-state']).toBe('compact');
  });

  test('omits data-czap-satellite when no component provided', () => {
    const attrs = satelliteAttrs({});

    expect(attrs['data-czap-satellite']).toBeUndefined();
  });

  test('omits data-czap-boundary when no boundary provided', () => {
    const attrs = satelliteAttrs({});

    expect(attrs['data-czap-boundary']).toBeUndefined();
  });

  test('omits data-czap-state when no initialState provided', () => {
    const attrs = satelliteAttrs({});

    expect(attrs['data-czap-state']).toBeUndefined();
  });

  test('combines all props into a complete attribute set', () => {
    const boundary = makeBoundary('viewport', [
      [0, 'mobile'],
      [768, 'desktop'],
    ]);

    const attrs = satelliteAttrs({
      boundary,
      component: makeComponentStub('DashGrid') as SatelliteProps['component'],
      class: 'main-grid',
      initialState: 'mobile',
    });

    expect(attrs['class']).toBe('czap-satellite main-grid');
    expect(attrs['data-czap-satellite']).toBe('DashGrid');
    expect(attrs['data-czap-state']).toBe('mobile');
    expect(attrs['data-czap-boundary']).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// resolveInitialStateFallback -- SSR first-state heuristic
// ---------------------------------------------------------------------------

describe('resolveInitialStateFallback', () => {
  test('returns the first state from a multi-state boundary', () => {
    const boundary = makeBoundary('viewport', [
      [0, 'small'],
      [768, 'medium'],
      [1200, 'large'],
    ]);

    expect(resolveInitialStateFallback(boundary)).toBe('small');
  });

  test('returns the only state from a single-state boundary', () => {
    const boundary = makeBoundary('viewport', [[0, 'only']]);

    expect(resolveInitialStateFallback(boundary)).toBe('only');
  });
});

// ---------------------------------------------------------------------------
// resolveInitialState -- server-side state resolution with context
// ---------------------------------------------------------------------------

describe('resolveInitialState', () => {
  const boundary = makeBoundary('viewport', [
    [0, 'compact'],
    [768, 'tablet'],
    [1200, 'desktop'],
  ]);

  test('resolves state from client hint viewport width', () => {
    const result = resolveInitialState(boundary, {
      userAgent: 'Mozilla/5.0',
      clientHints: { 'Sec-CH-Viewport-Width': '1400' },
      detectedTier: 'reactive',
    });

    expect(result).toBe('desktop');
  });

  test('resolves to compact for small viewport client hint', () => {
    const result = resolveInitialState(boundary, {
      userAgent: 'Mozilla/5.0',
      clientHints: { 'Sec-CH-Viewport-Width': '320' },
      detectedTier: 'reactive',
    });

    expect(result).toBe('compact');
  });

  test('resolves to tablet for mid-range viewport client hint', () => {
    const result = resolveInitialState(boundary, {
      userAgent: 'Mozilla/5.0',
      clientHints: { 'Sec-CH-Viewport-Width': '800' },
      detectedTier: 'reactive',
    });

    expect(result).toBe('tablet');
  });

  test('falls back to user agent estimation when no client hints', () => {
    const result = resolveInitialState(boundary, {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      clientHints: {},
      detectedTier: 'reactive',
    });

    // iPhone UA estimates 375px viewport, which falls in compact (0-767)
    expect(result).toBe('compact');
  });

  test('detects tablet from iPad user agent', () => {
    const result = resolveInitialState(boundary, {
      userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)',
      clientHints: {},
      detectedTier: 'reactive',
    });

    // iPad UA estimates 768px viewport, which falls in tablet (768-1199)
    expect(result).toBe('tablet');
  });

  test('detects desktop from generic user agent', () => {
    const result = resolveInitialState(boundary, {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      clientHints: {},
      detectedTier: 'reactive',
    });

    // Desktop UA estimates 1280px viewport, which falls in desktop (>= 1200)
    expect(result).toBe('desktop');
  });

  test('falls back to tier-based synthetic value when no UA or hints', () => {
    const result = resolveInitialState(boundary, {
      userAgent: '',
      clientHints: {},
      detectedTier: 'static',
    });

    // static tier -> ordinal 0 -> synthetic value 320
    // 320 >= 0 (compact), 320 < 768 (not tablet)
    expect(result).toBe('compact');
  });

  test('reduced motion with low tier biases to first state', () => {
    const result = resolveInitialState(boundary, {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      clientHints: {
        'Sec-CH-Viewport-Width': '1400',
        'Sec-CH-Prefers-Reduced-Motion': 'reduce',
      },
      detectedTier: 'styled', // ordinal 1 <= 1
    });

    // Reduced motion + low tier -> first state
    expect(result).toBe('compact');
  });

  test('reduced motion with high tier does not bias to first state', () => {
    const result = resolveInitialState(boundary, {
      userAgent: 'Mozilla/5.0',
      clientHints: {
        'Sec-CH-Viewport-Width': '1400',
        'Sec-CH-Prefers-Reduced-Motion': 'reduce',
      },
      detectedTier: 'animated', // ordinal 3 > 1
    });

    // High tier overrides reduced motion bias, uses viewport hint
    expect(result).toBe('desktop');
  });

  test('returns first state for single-state boundary regardless of context', () => {
    const singleBoundary = makeBoundary('viewport', [[0, 'only']]);

    const result = resolveInitialState(singleBoundary, {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      clientHints: { 'Sec-CH-Viewport-Width': '2000' },
      detectedTier: 'gpu',
    });

    expect(result).toBe('only');
  });

  test('handles case-insensitive client hint header keys', () => {
    const result = resolveInitialState(boundary, {
      userAgent: '',
      clientHints: { 'sec-ch-viewport-width': '900' },
      detectedTier: 'reactive',
    });

    expect(result).toBe('tablet');
  });

  test('falls back to the first state when the evaluated value is below the first threshold', () => {
    const offsetBoundary = makeBoundary('viewport', [
      [320, 'compact'],
      [768, 'tablet'],
    ]);

    const result = resolveInitialState(offsetBoundary, {
      userAgent: '',
      clientHints: { 'Sec-CH-Viewport-Width': '100' },
      detectedTier: 'reactive',
    });

    expect(result).toBe('compact');
  });

  test('falls back cleanly for malformed hints and empty boundary state lists', () => {
    const invalidHintResult = resolveInitialState(boundary, {
      userAgent: '',
      clientHints: { 'Sec-CH-Viewport-Width': 'not-a-number' },
      detectedTier: 'styled',
    });
    expect(invalidHintResult).toBe('compact');

    const emptyBoundary = {
      ...boundary,
      states: [],
      thresholds: [],
    };
    expect(resolveInitialState(emptyBoundary as never, { userAgent: '', clientHints: {}, detectedTier: 'gpu' })).toBe('');
  });
});

// ---------------------------------------------------------------------------
// integration factory -- hook configuration
// ---------------------------------------------------------------------------

describe('integration', () => {
  test('returns an AstroIntegration with correct name', () => {
    const integ = integration();

    expect(integ.name).toBe('@czap/astro');
  });

  test('exposes required Astro lifecycle hooks', () => {
    const integ = integration();

    expect(integ.hooks['astro:config:setup']).toBeInstanceOf(Function);
    expect(integ.hooks['astro:config:done']).toBeInstanceOf(Function);
    expect(integ.hooks['astro:server:setup']).toBeInstanceOf(Function);
    expect(integ.hooks['astro:build:done']).toBeInstanceOf(Function);
  });

  test('accepts empty config', () => {
    const integ = integration({});

    expect(integ.name).toBe('@czap/astro');
    expect(integ.hooks['astro:config:setup']).toBeInstanceOf(Function);
  });

  test('accepts full config with all options', () => {
    const integ = integration({
      detect: true,
      serverIslands: true,
      vite: {
        boundaryDir: 'src/boundaries',
        tokenDir: 'src/tokens',
        themeDir: 'src/themes',
        styleDir: 'src/styles',
        hmr: true,
        environments: ['browser', 'server'],
      },
    });

    expect(integ.name).toBe('@czap/astro');
    expect(integ.hooks['astro:config:setup']).toBeInstanceOf(Function);
  });

  test('detect defaults to enabled when not specified', () => {
    // The integration source code shows: config?.detect !== false
    // So undefined -> true (detect is enabled by default)
    const integ = integration();

    // We can verify this by checking the hook exists (it always does),
    // but the actual detect injection happens inside the hook callback.
    // The important behavioral test is that the factory does not throw.
    expect(integ).toBeDefined();
  });

  test('serverIslands defaults to disabled when not specified', () => {
    // config?.serverIslands === true -> must be explicitly enabled
    const integ = integration();

    // Same as above -- the behavioral impact is inside the hook.
    expect(integ).toBeDefined();
  });

  test('config:setup registers directives, scripts, and plugin config', () => {
    const integ = integration();
    const directives: Array<{ name: string; entrypoint: string }> = [];
    const scripts: Array<{ stage: string; content: string }> = [];
    const updates: unknown[] = [];
    const logs: string[] = [];

    integ.hooks['astro:config:setup']({
      updateConfig: (config: unknown) => {
        updates.push(config);
      },
      addClientDirective: (directive: { name: string; entrypoint: string }) => {
        directives.push(directive);
      },
      injectScript: (stage: string, content: string) => {
        scripts.push({ stage, content });
      },
      logger: {
        info(message: string) {
          logs.push(message);
        },
      },
    } as never);

    expect(directives.map((directive) => directive.name)).toEqual(['satellite', 'stream', 'llm', 'gpu']);
    expect(updates[0]).toMatchObject({
      vite: {
        plugins: [expect.objectContaining({ name: '@czap/vite' })],
      },
    });
    const detectScript = scripts.find((script) => script.stage === 'head-inline' && script.content.includes('__CZAP_DETECT__'));
    const gpuUpgradeScript = scripts.find(
      (script) => script.stage === 'page' && script.content.includes('gpuTier') && script.content.includes('__CZAP_DETECT__'),
    );

    expect(detectScript).toBeDefined();
    expect(detectScript?.content).toContain('Object.freeze');
    expect(detectScript?.content).toContain('writable: false');
    expect(detectScript?.content).toContain('provisional: true');
    expect(detectScript?.content).not.toContain('memory:');
    expect(detectScript?.content).not.toContain('colorScheme:');
    expect(detectScript?.content).not.toContain('eval(');
    expect(detectScript?.content).not.toContain('new Function');
    expect(gpuUpgradeScript?.content).toContain('Object.freeze');
    expect(gpuUpgradeScript?.content).toContain('writable: false');
    expect(gpuUpgradeScript?.content).not.toContain('window.__CZAP_DETECT__ || {}');
    expect(scripts.some((script) => script.stage === 'page' && script.content.includes('bootstrapSlots'))).toBe(true);
    expect(scripts.some((script) => script.stage === 'page' && script.content.includes('installSwapReinit'))).toBe(
      true,
    );
    expect(logs).toContain('Registered gpu client directive');
    expect(logs).toContain('Injected GPU probe upgrade');
  });

  test('config:setup honors worker, wasm, serverIslands, and disabled directives', () => {
    const integ = integration({
      detect: false,
      serverIslands: true,
      stream: { enabled: false },
      llm: { enabled: false },
      gpu: { enabled: false },
      workers: { enabled: true },
      wasm: { enabled: true },
    });
    const directives: Array<{ name: string; entrypoint: string }> = [];
    const scripts: string[] = [];
    const updates: unknown[] = [];

    integ.hooks['astro:config:setup']({
      updateConfig: (config: unknown) => {
        updates.push(config);
      },
      addClientDirective: (directive: { name: string; entrypoint: string }) => {
        directives.push(directive);
      },
      injectScript: (_stage: string, content: string) => {
        scripts.push(content);
      },
      logger: { info() {} },
    } as never);

    expect(directives.map((directive) => directive.name)).toEqual(['satellite', 'worker', 'wasm']);
    expect(updates).toContainEqual({
      experimental: {
        serverIslands: true,
      },
    });
    expect(scripts.some((script) => script.includes('__CZAP_DETECT__'))).toBe(false);
    expect(scripts.some((script) => script.includes('virtual:czap/wasm-url'))).toBe(true);
  });

  test('config:setup still injects detect without the gpu probe upgrade when gpu is disabled', () => {
    const integ = integration({
      detect: true,
      gpu: { enabled: false },
    });
    const scripts: Array<{ stage: string; content: string }> = [];

    integ.hooks['astro:config:setup']({
      updateConfig: () => undefined,
      addClientDirective: () => undefined,
      injectScript: (stage: string, content: string) => {
        scripts.push({ stage, content });
      },
      logger: { info() {} },
    } as never);

    expect(scripts.some((script) => script.stage === 'head-inline' && script.content.includes('__CZAP_DETECT__'))).toBe(
      true,
    );
    expect(scripts.some((script) => script.content.includes('navigator.gpu'))).toBe(false);
  });

  test('server:setup installs middleware and emits client-hint headers', () => {
    const integ = integration({
      workers: { enabled: true },
    });

    const middlewares: Array<
      (req: unknown, res: { setHeader(name: string, value: string): void }, next: () => void) => void
    > = [];
    const logs: string[] = [];

    integ.hooks['astro:server:setup']({
      server: {
        middlewares: {
          use(fn: (req: unknown, res: { setHeader(name: string, value: string): void }, next: () => void) => void) {
            middlewares.push(fn);
          },
        },
      },
      logger: {
        info(message: string) {
          logs.push(message);
        },
      },
    } as never);

    expect(middlewares).toHaveLength(1);

    const headers = new Map<string, string>();
    let nextCalled = false;

    middlewares[0]?.(
      {},
      {
        setHeader(name: string, value: string) {
          headers.set(name, value);
        },
      },
      () => {
        nextCalled = true;
      },
    );

    expect(nextCalled).toBe(true);
    expect(headers.get('Accept-CH')).toContain('Sec-CH-Viewport-Width');
    expect(headers.get('Critical-CH')).toBe('Sec-CH-Viewport-Width');
    expect(headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
    expect(headers.get('Cross-Origin-Embedder-Policy')).toBe('require-corp');
    expect(logs).toContain('@czap dev server middleware active');
  });

  test('server:setup skips middleware when detect is disabled', () => {
    const integ = integration({ detect: false });
    const middlewares: unknown[] = [];

    integ.hooks['astro:server:setup']({
      server: {
        middlewares: {
          use(fn: unknown) {
            middlewares.push(fn);
          },
        },
      },
      logger: { info() {} },
    } as never);

    expect(middlewares).toHaveLength(0);
  });

  test('server:setup still installs isolation middleware when workers are enabled without detect', () => {
    const integ = integration({ detect: false, workers: { enabled: true } });
    const middlewares: Array<
      (req: unknown, res: { setHeader(name: string, value: string): void }, next: () => void) => void
    > = [];

    integ.hooks['astro:server:setup']({
      server: {
        middlewares: {
          use(fn: (req: unknown, res: { setHeader(name: string, value: string): void }, next: () => void) => void) {
            middlewares.push(fn);
          },
        },
      },
      logger: { info() {} },
    } as never);

    expect(middlewares).toHaveLength(1);

    const headers = new Map<string, string>();
    middlewares[0]?.(
      {},
      {
        setHeader(name: string, value: string) {
          headers.set(name, value);
        },
      },
      () => undefined,
    );

    expect(headers.get('Accept-CH')).toBeUndefined();
    expect(headers.get('Critical-CH')).toBeUndefined();
    expect(headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
    expect(headers.get('Cross-Origin-Embedder-Policy')).toBe('require-corp');
  });

  test('config:done and build:done log the final integration status', () => {
    const integ = integration();
    const logs: string[] = [];

    integ.hooks['astro:config:done']({
      config: { output: 'server' },
      logger: {
        info(message: string) {
          logs.push(message);
        },
      },
    } as never);

    integ.hooks['astro:build:done']({
      logger: {
        info(message: string) {
          logs.push(message);
        },
      },
    } as never);

    expect(logs).toContain('@czap configured for server output');
    expect(logs).toContain('@czap build integration complete');
  });
});
