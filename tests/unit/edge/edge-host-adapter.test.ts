import { afterEach, describe, expect, test, vi } from 'vitest';
import { createEdgeHostAdapter } from '@czap/edge';
import * as ThemeCompiler from '../../../packages/edge/src/theme-compiler.js';

afterEach(() => {
  vi.restoreAllMocks();
});

function makeHeaders(overrides: Record<string, string> = {}): Headers {
  return new Headers({
    'sec-ch-viewport-width': '1280',
    'sec-ch-device-memory': '8',
    ...overrides,
  });
}

function makeKV() {
  const store = new Map<string, string>();
  return {
    store,
    kv: {
      async get(key: string) {
        return store.get(key) ?? null;
      },
      async put(key: string, value: string) {
        store.set(key, value);
      },
    },
  };
}

describe('createEdgeHostAdapter', () => {
  test('resolves client hints and response headers without optional features', async () => {
    const adapter = createEdgeHostAdapter();
    const result = await adapter.resolve(makeHeaders());

    expect(result.capabilities.viewportWidth).toBe(1280);
    expect(result.tier.capLevel).toBeDefined();
    expect(result.htmlAttributes).toContain('data-czap-cap=');
    expect(result.responseHeaders.acceptCH).toContain('Sec-CH-Viewport-Width');
    expect(result.cacheStatus).toBe('disabled');
  });

  test('compiles theme config from a host callback', async () => {
    const adapter = createEdgeHostAdapter({
      theme: ({ tier }) => ({
        prefix: 'brand',
        tokens: {
          'color.primary': tier.designTier,
          'space.base': 16,
        },
      }),
    });

    const result = await adapter.resolve(makeHeaders());
    expect(result.theme?.css).toContain('--brand-color-primary');
    expect(result.theme?.inlineStyle).toContain('--brand-space-base:16');
  });

  test('precompiles static themes once and reuses response headers across resolves', async () => {
    const compileSpy = vi.spyOn(ThemeCompiler, 'compileTheme');
    const adapter = createEdgeHostAdapter({
      theme: {
        prefix: 'brand',
        tokens: {
          'color.primary': '#00e5ff',
          'space.base': 16,
        },
      },
    });

    const first = await adapter.resolve(makeHeaders());
    const second = await adapter.resolve(makeHeaders({ 'sec-ch-device-memory': '4' }));

    expect(compileSpy).toHaveBeenCalledTimes(1);
    expect(second.theme).toEqual(first.theme);
    expect(second.responseHeaders).toBe(first.responseHeaders);
  });

  test('skips theme compilation when the host callback returns null', async () => {
    const compileSpy = vi.spyOn(ThemeCompiler, 'compileTheme');
    compileSpy.mockClear();
    const adapter = createEdgeHostAdapter({
      theme: () => null,
    });

    const result = await adapter.resolve(makeHeaders());

    expect(result.theme).toBeUndefined();
    expect(compileSpy).not.toHaveBeenCalled();
  });

  test('skips theme compilation when the host callback returns undefined', async () => {
    const compileSpy = vi.spyOn(ThemeCompiler, 'compileTheme');
    const adapter = createEdgeHostAdapter({
      theme: () => undefined,
    });

    const result = await adapter.resolve(makeHeaders());

    expect(result.theme).toBeUndefined();
    expect(compileSpy).not.toHaveBeenCalled();
  });

  test('fills boundary cache on miss and reuses it on hit', async () => {
    const { kv, store } = makeKV();
    let compileCalls = 0;
    const adapter = createEdgeHostAdapter({
      cache: {
        kv,
        boundaryId: 'fnv1a:test-boundary' as any,
        compile: ({ tier }) => {
          compileCalls++;
          return {
            css: `.${tier.designTier}{color:red;}`,
            propertyRegistrations: '@property --x {}',
            containerQueries: '@container size {}',
          };
        },
      },
    });

    const first = await adapter.resolve(makeHeaders());
    const second = await adapter.resolve(makeHeaders());

    expect(first.cacheStatus).toBe('miss');
    expect(second.cacheStatus).toBe('hit');
    expect(first.compiledOutputs?.css).toContain('color:red');
    expect(second.compiledOutputs).toEqual(first.compiledOutputs);
    expect(compileCalls).toBe(1);
    expect(store.size).toBe(1);
  });

  test('passes compiled static theme through the cache compile context on misses', async () => {
    const { kv } = makeKV();
    const compile = vi.fn(({ theme }) => ({
      css: theme?.css ?? '',
      propertyRegistrations: '',
      containerQueries: '',
    }));
    const adapter = createEdgeHostAdapter({
      theme: {
        prefix: 'brand',
        tokens: {
          'color.primary': '#00e5ff',
        },
      },
      cache: {
        kv,
        boundaryId: 'fnv1a:test-boundary' as any,
        compile,
      },
    });

    const result = await adapter.resolve(makeHeaders());

    expect(compile).toHaveBeenCalledWith(
      expect.objectContaining({
        theme: expect.objectContaining({
          css: expect.stringContaining('--brand-color-primary'),
        }),
      }),
    );
    expect(result.cacheStatus).toBe('miss');
  });
});
