/**
 * HTML transform tests -- data-czap="name" -> resolved boundary JSON.
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { Diagnostics } from '@czap/core';
import { captureDiagnosticsAsync } from '../../helpers/diagnostics.js';

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  Diagnostics.reset();
});

describe('transformHTML', () => {
  test('returns source unchanged when no data-czap attributes found', async () => {
    const { transformHTML } = await import('@czap/vite/html-transform');
    const source = '<div class="foo">hello</div>';
    const result = await transformHTML(source, '/test/page.astro', '/test');
    expect(result).toBe(source);
  });

  test('does not modify data-czap-boundary (already resolved)', async () => {
    const { transformHTML } = await import('@czap/vite/html-transform');
    const source = '<div data-czap-boundary=\'{"id":"hero"}\'></div>';
    const result = await transformHTML(source, '/test/page.astro', '/test');
    expect(result).toBe(source);
  });

  test('does not modify data-czap-state or other data-czap-* attrs', async () => {
    const { transformHTML } = await import('@czap/vite/html-transform');
    const source = '<div data-czap-state="mobile" data-czap-stream-url="/api"></div>';
    const result = await transformHTML(source, '/test/page.astro', '/test');
    expect(result).toBe(source);
  });

  test('replaces data-czap names with serialized boundary payloads when resolution succeeds', async () => {
    vi.doMock('../../../packages/vite/src/primitive-resolve.js', () => ({
      resolvePrimitive: vi.fn(async () => ({
        primitive: {
          id: 'hero',
          input: 'viewport.width',
          thresholds: [0, 768],
          states: ['mobile', 'desktop'],
          hysteresis: 32,
        },
        source: '/test/boundaries.ts',
      })),
      KIND_META: {
        boundary: { file: 'boundaries.ts', suffix: '.boundaries.ts', tag: 'BoundaryDef' },
        token:    { file: 'tokens.ts',     suffix: '.tokens.ts',     tag: 'TokenDef'    },
        theme:    { file: 'themes.ts',     suffix: '.themes.ts',     tag: 'ThemeDef'    },
        style:    { file: 'styles.ts',     suffix: '.styles.ts',     tag: 'StyleDef'    },
      },
    }));

    const { transformHTML } = await import('@czap/vite/html-transform');
    const source = '<section data-czap="hero"><slot /></section>';
    const result = await transformHTML(source, '/test/page.astro', '/test');

    expect(result).toContain("data-czap-boundary='");
    expect(result).toContain('"id":"hero"');
    expect(result).not.toContain('data-czap="hero"');
  });

  test('warns and leaves source unchanged when a boundary cannot be resolved', async () => {
    vi.doMock('../../../packages/vite/src/primitive-resolve.js', () => ({
      resolvePrimitive: vi.fn(async () => null),
      KIND_META: {
        boundary: { file: 'boundaries.ts', suffix: '.boundaries.ts', tag: 'BoundaryDef' },
        token:    { file: 'tokens.ts',     suffix: '.tokens.ts',     tag: 'TokenDef'    },
        theme:    { file: 'themes.ts',     suffix: '.themes.ts',     tag: 'ThemeDef'    },
        style:    { file: 'styles.ts',     suffix: '.styles.ts',     tag: 'StyleDef'    },
      },
    }));

    await captureDiagnosticsAsync(async ({ events }) => {
      const { transformHTML } = await import('@czap/vite/html-transform');
      const source = '<div data-czap="hero"></div><div data-czap="footer"></div>';
      const result = await transformHTML(source, '/test/page.astro', '/test');
      const boundaryWarnings = events.filter((event) => event.code === 'boundary-not-found');

      expect(result).toBe(source);
      expect(boundaryWarnings).toEqual([
        expect.objectContaining({
          level: 'warn',
          source: 'czap/vite.html-transform',
          code: 'boundary-not-found',
          detail: { fromFile: '/test/page.astro' },
        }),
        expect.objectContaining({
          level: 'warn',
          source: 'czap/vite.html-transform',
          code: 'boundary-not-found',
          detail: { fromFile: '/test/page.astro' },
        }),
      ]);
    });
  });

  test('plugin routes astro and html files through transformHTML before runtime injection', async () => {
    const transformHTMLSpy = vi.fn(async (source: string, fromFile: string) => `${source}<!-- transformed:${fromFile} -->`);
    vi.doMock('../../../packages/vite/src/html-transform.js', () => ({
      transformHTML: transformHTMLSpy,
    }));

    const { plugin } = await import('../../../packages/vite/src/plugin.js');
    const vitePlugin = plugin();
    vitePlugin.configResolved?.({ root: '/repo', command: 'serve' } as never);

    const astroResult = await vitePlugin.transform?.call({ warn: vi.fn() } as never, '<section />', '/repo/src/page.astro');
    const htmlResult = await vitePlugin.transform?.call({ warn: vi.fn() } as never, '<main />', '/repo/src/index.html');
    const jsResult = await vitePlugin.transform?.call({ warn: vi.fn() } as never, 'export {}', '/repo/src/entry.ts');

    expect(transformHTMLSpy).toHaveBeenNthCalledWith(1, '<section />', '/repo/src/page.astro', '/repo');
    expect(transformHTMLSpy).toHaveBeenNthCalledWith(2, '<main />', '/repo/src/index.html', '/repo');
    expect(astroResult).toEqual({
      code: '<section /><!-- transformed:/repo/src/page.astro -->',
      map: null,
    });
    expect(htmlResult).toEqual({
      code: '<main /><!-- transformed:/repo/src/index.html -->',
      map: null,
    });
    expect(jsResult).toBeNull();
  });
});
