import { afterEach, describe, expect, test, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Boundary, Diagnostics, Style, Theme, Token } from '@czap/core';
import { compileQuantizeBlock, parseQuantizeBlocks } from '../../../packages/vite/src/css-quantize.js';
import * as CSSQuantizeModule from '../../../packages/vite/src/css-quantize.js';
import { buildEnvironments, getEnvironmentConfig } from '../../../packages/vite/src/environments.js';
import { plugin } from '../../../packages/vite/src/plugin.js';
import * as StyleTransformModule from '../../../packages/vite/src/style-transform.js';
import * as ThemeTransformModule from '../../../packages/vite/src/theme-transform.js';
import * as TokenTransformModule from '../../../packages/vite/src/token-transform.js';
import { resolvePrimitive } from '../../../packages/vite/src/primitive-resolve.js';
import * as PrimitiveResolveModule from '../../../packages/vite/src/primitive-resolve.js';
import { isVirtualId, loadVirtualModule, resolveVirtualId } from '../../../packages/vite/src/virtual-modules.js';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'czap-vite-'));
  tempDirs.push(dir);
  return dir;
}

function writeModule(dir: string, fileName: string, exportName: string, value: unknown): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, fileName), `export const ${exportName} = ${JSON.stringify(value, null, 2)};\n`);
}

afterEach(() => {
  vi.restoreAllMocks();
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe('@czap/vite environments', () => {
  test('returns the expected browser environment config', () => {
    const config = getEnvironmentConfig('browser');
    expect(config.resolve.conditions).toContain('browser');
    expect(config.optimizeDeps.include).toContain('@czap/core');
  });

  test('builds a keyed environment map', () => {
    const config = buildEnvironments(['browser', 'shader']);
    expect(Object.keys(config)).toEqual(['browser', 'shader']);
    expect(config['shader']?.resolve.extensions).toContain('.wgsl');
  });
});

describe('@czap/vite resolvers', () => {
  test('fall back from wrong-tag same-directory modules to wildcard and project-root matches', async () => {
    const root = makeTempDir();
    const srcDir = join(root, 'src');
    mkdirSync(srcDir, { recursive: true });

    const token = Token.make({
      name: 'accent',
      category: 'color',
      axes: ['theme'] as const,
      values: { light: '#ffffff' },
      fallback: '#ffffff',
    });
    const theme = Theme.make({
      name: 'brand',
      variants: ['light'] as const,
      tokens: { accent: { light: '#ffffff' } },
      meta: { light: { label: 'Light', mode: 'light' } },
    });
    const style = Style.make({
      base: { properties: { color: 'var(--czap-accent)' } },
      states: { compact: { properties: { display: 'block' } } },
    });
    const boundary = Boundary.make({
      input: 'viewport.width',
      at: [
        [0, 'compact'],
        [768, 'expanded'],
      ] as const,
    });

    writeFileSync(join(srcDir, 'tokens.ts'), 'export const accent = { _tag: "NotAToken" };\n');
    writeFileSync(join(srcDir, 'themes.ts'), 'export const brand = { _tag: "NotATheme" };\n');
    writeFileSync(join(srcDir, 'styles.ts'), 'export const card = { _tag: "NotAStyle" };\n');
    writeFileSync(join(srcDir, 'boundaries.ts'), 'export const layout = { _tag: "NotABoundary" };\n');
    writeModule(srcDir, 'wild.tokens.ts', 'accent', token);
    writeModule(srcDir, 'wild.themes.ts', 'brand', theme);
    writeModule(srcDir, 'wild.styles.ts', 'card', style);
    writeModule(root, 'boundaries.ts', 'layout', boundary);

    const fromFile = join(srcDir, 'app.css');

    expect((await resolvePrimitive('token', 'accent', fromFile, root))?.source).toBe(join(srcDir, 'wild.tokens.ts'));
    expect((await resolvePrimitive('theme', 'brand', fromFile, root))?.source).toBe(join(srcDir, 'wild.themes.ts'));
    expect((await resolvePrimitive('style', 'card', fromFile, root))?.source).toBe(join(srcDir, 'wild.styles.ts'));
    expect((await resolvePrimitive('boundary', 'layout', fromFile, root))?.source).toBe(join(root, 'boundaries.ts'));
  });

  test('warn on import failures and return null when resolution exhausts every convention path', async () => {
    const root = makeTempDir();
    const srcDir = join(root, 'src');
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, 'tokens.ts'), 'throw new Error("boom");\n');
    writeFileSync(join(root, 'themes.ts'), 'throw new Error("theme boom");\n');

    const { sink, events } = Diagnostics.createBufferSink();
    Diagnostics.setSink(sink);

    const fromFile = join(srcDir, 'app.css');
    expect(await resolvePrimitive('token', 'missing', fromFile, root)).toBeNull();
    expect(await resolvePrimitive('theme', 'missingTheme', fromFile, root)).toBeNull();
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'czap/vite.token-resolve', code: 'import-failed' }),
        expect.objectContaining({ source: 'czap/vite.theme-resolve', code: 'import-failed' }),
      ]),
    );
  });

  test('resolves boundary definitions from root wildcard files and records boundary import failures', async () => {
    const root = makeTempDir();
    const srcDir = join(root, 'src');
    mkdirSync(srcDir, { recursive: true });

    const boundary = Boundary.make({
      input: 'viewport.width',
      at: [
        [0, 'compact'],
        [1280, 'expanded'],
      ] as const,
    });

    writeFileSync(join(root, 'bad.boundaries.ts'), 'throw new Error("boundary boom");\n');
    writeModule(root, 'good.boundaries.ts', 'hero', boundary);

    const { sink, events } = Diagnostics.createBufferSink();
    Diagnostics.setSink(sink);

    const resolved = await resolvePrimitive('boundary', 'hero', join(srcDir, 'app.css'), root);
    expect(resolved?.source).toBe(join(root, 'good.boundaries.ts'));
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'czap/vite.boundary-resolve', code: 'import-failed' }),
      ]),
    );
  });
});

describe('@czap/vite quantize parser', () => {
  test('parses multiline declarations, ignores invalid declarations, and compiles to container queries', () => {
    const boundary = Boundary.make({
      input: 'viewport.width',
      at: [
        [0, 'mobile'],
        [768, 'desktop'],
      ] as const,
    });
    const css = `
@quantize layout {
  mobile {
    background: linear-gradient(
      to bottom,
      red,
      blue
    );
    broken declaration
    color: var(--czap-accent, {});
  }
  desktop {
    content: "ok";
  }
}
`;

    const [block] = parseQuantizeBlocks(css, 'app.css');
    expect(block).toBeDefined();
    expect(block?.states.mobile).toEqual({
      background: 'linear-gradient(\n      to bottom,\n      red,\n      blue\n    )',
    });
    expect(block?.states.desktop).toEqual({ content: '"ok"' });

    const compiled = compileQuantizeBlock(block!, boundary);
    expect(compiled).toContain('@container');
    expect(compiled).toContain('background: linear-gradient');
    expect(compiled).toContain('content: "ok"');
  });

  test('parses quoted strings, inline comments, empty states, and multiple blocks without losing structure', () => {
    const css = `
/* prelude */
@quantize layout {
  mobile {
    content: "say \\\"hi\\\"";
    color: red /* keep going */;
  }
  empty {}
}

.unrelated { display: block; }

@quantize secondary {
  compact {
    opacity: 0.5;
  }
}
`;

    const blocks = parseQuantizeBlocks(css, 'multi.css');
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({
      boundaryName: 'layout',
      states: {
        mobile: {
          content: '"say \\"hi\\""',
          color: 'red',
        },
        empty: {},
      },
    });
    expect(blocks[1]).toMatchObject({
      boundaryName: 'secondary',
      states: {
        compact: {
          opacity: '0.5',
        },
      },
    });
  });

  test('returns no blocks when css contains no quantize at-rules', () => {
    expect(parseQuantizeBlocks('.card { color: red; }', 'plain.css')).toEqual([]);
  });

  test('recovers from nested brace noise and declarations that end at the closing state brace', () => {
    const css = `
@quantize layout {
  mobile {
    {}
    opacity: 0.25
  }
}
`;

    const [block] = parseQuantizeBlocks(css, 'robust.css');
    expect(block).toMatchObject({
      boundaryName: 'layout',
      states: {
        mobile: {
          opacity: '0.25',
        },
      },
    });
  });

  test('drops declarations with invalid property names while keeping valid siblings', () => {
    const css = `
@quantize layout {
  mobile {
    1bad: red;
    color: blue;
  }
}
`;

    const [block] = parseQuantizeBlocks(css, 'invalid-prop.css');
    expect(block?.states.mobile).toEqual({ color: 'blue' });
  });

  test('skips nested non-state wrappers inside a quantize block and still parses later states', () => {
    const css = `
@quantize layout {
  @supports (display: grid) {
  }

  mobile {
    display: grid;
  }
}
`;

    const [block] = parseQuantizeBlocks(css, 'nested-wrapper.css');
    expect(block).toMatchObject({
      boundaryName: 'layout',
      states: {
        mobile: {
          display: 'grid',
        },
      },
    });
  });
});

describe('@czap/vite virtual modules', () => {
  test('resolves known virtual ids', () => {
    expect(resolveVirtualId('virtual:czap/tokens')).toBe('\0virtual:czap/tokens');
    expect(resolveVirtualId('virtual:czap/hmr-client')).toBe('\0virtual:czap/hmr-client');
    expect(resolveVirtualId('virtual:czap/unknown')).toBeUndefined();
  });

  test('identifies resolved virtual ids', () => {
    expect(isVirtualId('\0virtual:czap/themes')).toBe(true);
    expect(isVirtualId('virtual:czap/themes')).toBe(false);
  });

  test('loads stub source for supported modules', () => {
    expect(loadVirtualModule('\0virtual:czap/tokens')).toContain('export const tokens');
    expect(loadVirtualModule('\0virtual:czap/tokens.css')).toContain(':root');
    expect(loadVirtualModule('\0virtual:czap/boundaries')).toContain('export const boundaries');
    expect(loadVirtualModule('\0virtual:czap/themes')).toContain('export const themes');
    expect(loadVirtualModule('\0virtual:czap/hmr-client')).toContain('import.meta.hot');
    expect(loadVirtualModule('\0virtual:czap/wasm-url')).toContain('export const wasmUrl = null');
    expect(loadVirtualModule('\0virtual:czap/config')).toContain('export const config = null');
    expect(loadVirtualModule('\0virtual:czap/missing')).toBeUndefined();
    expect(loadVirtualModule('virtual:czap/tokens')).toBeUndefined();
  });
});

describe('@czap/vite plugin', () => {
  test('injects the HMR client by default', () => {
    const vitePlugin = plugin();
    const tags = vitePlugin.transformIndexHtml?.();
    expect(tags).toHaveLength(1);
    expect(tags?.[0]?.children).toContain('virtual:czap/hmr-client');
  });

  test('skips HMR client injection when disabled', () => {
    const vitePlugin = plugin({ hmr: false });
    expect(vitePlugin.transformIndexHtml?.()).toEqual([]);
  });

  test('returns configured environments only when requested', () => {
    const noEnvPlugin = plugin();
    expect(noEnvPlugin.config?.()).toEqual({});

    const envPlugin = plugin({ environments: ['browser', 'server'] });
    const result = envPlugin.config?.() as { environments: Record<string, unknown> };
    expect(Object.keys(result.environments)).toEqual(['browser', 'server']);
  });

  test('resolves and loads virtual modules through the plugin hooks', () => {
    const vitePlugin = plugin();
    const resolved = vitePlugin.resolveId?.('virtual:czap/tokens');
    const wasmResolved = vitePlugin.resolveId?.('virtual:czap/wasm-url');

    expect(resolved).toBe('\0virtual:czap/tokens');
    expect(wasmResolved).toBe('\0virtual:czap/wasm-url');
    expect(vitePlugin.load?.(resolved!)).toContain('export const tokens');
    expect(vitePlugin.load?.(wasmResolved!)).toContain('export const wasmUrl = null');
    expect(vitePlugin.resolveId?.('src/app.css')).toBeUndefined();
  });

  test('resolves a live wasm browser URL when wasm support is enabled', () => {
    const root = makeTempDir();
    const publicDir = join(root, 'public');
    mkdirSync(publicDir, { recursive: true });
    writeFileSync(join(publicDir, 'czap-compute.wasm'), Buffer.from([0x00, 0x61, 0x73, 0x6d]));

    const vitePlugin = plugin({ wasm: { enabled: true } });
    vitePlugin.configResolved?.({ root, command: 'serve' } as never);
    const wasmModule = vitePlugin.load?.('\0virtual:czap/wasm-url');

    expect(wasmModule).toContain('/czap-compute.wasm');
  });

  test('warns when wasm is enabled without a resolvable binary and emits rollup urls for build output', () => {
    const missingRoot = makeTempDir();
    const missingPlugin = plugin({ wasm: { enabled: true } });
    const warn = vi.fn();
    missingPlugin.configResolved?.({ root: missingRoot, command: 'serve' } as never);
    missingPlugin.buildStart?.call({ warn, emitFile: vi.fn() } as never);
    expect(warn).toHaveBeenCalledWith(
      'WASM support was enabled, but no czap-compute binary could be resolved. Runtime will fall back to TypeScript kernels.',
    );
    expect(missingPlugin.load?.('\0virtual:czap/wasm-url')).toContain('export const wasmUrl = null');

    const buildRoot = makeTempDir();
    const distDir = join(buildRoot, 'dist');
    mkdirSync(distDir, { recursive: true });
    const buildWasmPath = join(distDir, 'czap-compute.wasm');
    writeFileSync(buildWasmPath, Buffer.from([0x00, 0x61, 0x73, 0x6d]));

    const buildPlugin = plugin({ wasm: { enabled: true, path: buildWasmPath } });
    const emitFile = vi.fn(() => 'asset-123');
    buildPlugin.configResolved?.({ root: buildRoot, command: 'build' } as never);
    buildPlugin.buildStart?.call({ warn: vi.fn(), emitFile } as never);

    expect(emitFile).toHaveBeenCalled();
    expect(buildPlugin.load?.('\0virtual:czap/wasm-url')).toContain('ROLLUP_FILE_URL_asset-123');
  });

  test('does not emit wasm assets during serve-mode startup when a binary is resolvable', () => {
    const root = makeTempDir();
    const publicDir = join(root, 'public');
    mkdirSync(publicDir, { recursive: true });
    writeFileSync(join(publicDir, 'czap-compute.wasm'), Buffer.from([0x00, 0x61, 0x73, 0x6d]));

    const vitePlugin = plugin({ wasm: { enabled: true } });
    const emitFile = vi.fn();

    vitePlugin.configResolved?.({ root, command: 'serve' } as never);
    vitePlugin.buildStart?.call({ warn: vi.fn(), emitFile } as never);

    expect(emitFile).not.toHaveBeenCalled();
    expect(vitePlugin.load?.('\0virtual:czap/wasm-url')).toContain('/czap-compute.wasm');
  });

  test('buildStart is a no-op when wasm support is disabled', () => {
    const vitePlugin = plugin();
    const warn = vi.fn();
    const emitFile = vi.fn();

    vitePlugin.buildStart?.call({ warn, emitFile } as never);

    expect(warn).not.toHaveBeenCalled();
    expect(emitFile).not.toHaveBeenCalled();
  });

  test('serves filesystem wasm urls for non-public binaries and keeps unknown files out of hmr updates', () => {
    const root = makeTempDir();
    const distDir = join(root, 'dist');
    mkdirSync(distDir, { recursive: true });
    const wasmPath = join(distDir, 'czap-compute.wasm');
    writeFileSync(wasmPath, Buffer.from([0x00, 0x61, 0x73, 0x6d]));

    const vitePlugin = plugin({ wasm: { enabled: true, path: wasmPath } });
    vitePlugin.configResolved?.({ root, command: 'serve' } as never);
    expect(vitePlugin.load?.('\0virtual:czap/wasm-url')).toContain(wasmPath.replace(/\\/g, '/'));

    const moduleGraph = {
      idToModuleMap: new Map([['src/app.ts', { id: 'src/app.ts' }]]),
      getModuleById() {
        return undefined;
      },
    };
    const context = { environment: { moduleGraph } };
    expect(vitePlugin.hotUpdate?.call(context as never, { file: 'src/notes.txt' } as never)).toBeUndefined();
  });

  test('reuses cached definition resolutions across repeated transforms of the same file', async () => {
    const root = makeTempDir();
    const srcDir = join(root, 'src');
    mkdirSync(srcDir, { recursive: true });

    const token = Token.make({
      name: 'accent',
      category: 'color',
      axes: ['theme'] as const,
      values: { light: '#ffffff' },
      fallback: '#ffffff',
    });
    const theme = Theme.make({
      name: 'brand',
      variants: ['light'] as const,
      tokens: { accent: { light: '#ffffff' } },
      meta: { light: { label: 'Light', mode: 'light' } },
    });
    const style = Style.make({
      base: { properties: { color: 'var(--czap-accent)' } },
      states: { compact: { properties: { display: 'block' } } },
    });
    const boundary = Boundary.make({
      input: 'viewport.width',
      at: [
        [0, 'compact'],
        [768, 'expanded'],
      ] as const,
    });

    writeModule(srcDir, 'tokens.ts', 'accent', token);
    writeModule(srcDir, 'themes.ts', 'brand', theme);
    writeModule(srcDir, 'styles.ts', 'card', style);
    writeModule(srcDir, 'boundaries.ts', 'layout', boundary);

    const resolvePrimitiveSpy = vi.spyOn(PrimitiveResolveModule, 'resolvePrimitive');

    const vitePlugin = plugin();
    vitePlugin.configResolved?.({ root, command: 'serve' } as never);

    const css = `
@token accent {}
@theme brand {}
@style card {}
@quantize layout {}
`;

    await vitePlugin.transform?.(css, join(srcDir, 'app.css'));
    await vitePlugin.transform?.(css, join(srcDir, 'app.css'));

    // 4 kinds resolved on first pass, 0 on second (all cached)
    expect(resolvePrimitiveSpy).toHaveBeenCalledTimes(4);
  });

  test('leaves malformed at-rule blocks unchanged when their opening brace is missing', async () => {
    const root = makeTempDir();
    const vitePlugin = plugin();
    vitePlugin.configResolved?.({ root, command: 'serve' } as never);

    const malformed = '@token accent ';

    await expect(vitePlugin.transform?.(malformed, join(root, 'src', 'broken.css'))).resolves.toBeNull();
  });

  test('returns null when a parsed quantize block cannot find an opening brace in the source', async () => {
    const root = makeTempDir();
    const cssFile = join(root, 'src', 'broken-quantize.css');
    mkdirSync(join(root, 'src'), { recursive: true });

    const boundary = Boundary.make({
      input: 'viewport.width',
      at: [[0, 'compact']] as const,
    });

    vi.spyOn(CSSQuantizeModule, 'parseQuantizeBlocks').mockReturnValue([
      {
        boundaryName: 'layout',
        line: 1,
        states: {
          compact: { color: 'red' },
        },
      },
    ]);
    vi.spyOn(CSSQuantizeModule, 'compileQuantizeBlock').mockReturnValue(
      '@container viewport-width (width >= 0px) { .card { color: red; } }',
    );

    const vitePlugin = plugin();
    vitePlugin.configResolved?.({ root, command: 'serve' } as never);

    await expect(vitePlugin.transform?.call({ warn() {} } as never, '@quantize layout ', cssFile)).resolves.toBeNull();
  });

  test('skips non-css ids and css files without czap at-rules', async () => {
    const vitePlugin = plugin();

    expect(await vitePlugin.transform?.call({ warn() {} } as never, '.app { color: red; }', 'src/app.ts')).toBeNull();
    expect(await vitePlugin.transform?.call({ warn() {} } as never, '.app { color: red; }', 'src/app.css')).toBeNull();
  });

  test('returns null for html files when no html transform changes are needed', async () => {
    const vitePlugin = plugin();

    expect(await vitePlugin.transform?.call({ warn() {} } as never, '<main>plain html</main>', 'src/app.html')).toBeNull();
  });

  test('transforms css blocks using same-directory definitions', async () => {
    const root = makeTempDir();
    const cssDir = join(root, 'src');
    mkdirSync(cssDir, { recursive: true });

    const boundary = Boundary.make({
      input: 'viewport.width',
      at: [
        [0, 'mobile'],
        [768, 'desktop'],
      ] as const,
    });
    const token = Token.make({
      name: 'accent',
      category: 'color',
      axes: ['theme'] as const,
      values: { light: '#ffffff', dark: '#000000' },
      fallback: '#ffffff',
    });
    const theme = Theme.make({
      name: 'brand',
      variants: ['light', 'dark'] as const,
      tokens: {
        accent: { light: '#ffffff', dark: '#000000' },
      },
      meta: {
        light: { label: 'Light', mode: 'light' },
        dark: { label: 'Dark', mode: 'dark' },
      },
    });
    const style = Style.make({
      boundary,
      base: {
        properties: {
          color: 'var(--czap-accent)',
        },
      },
      states: {
        mobile: { properties: { padding: '8px' } },
        desktop: { properties: { padding: '16px' } },
      },
    });

    writeModule(cssDir, 'tokens.ts', 'accent', token);
    writeModule(cssDir, 'themes.ts', 'brand', theme);
    writeModule(cssDir, 'styles.ts', 'card', style);
    writeModule(cssDir, 'boundaries.ts', 'layout', boundary);

    const cssFile = join(cssDir, 'card.css');
    const css = `
@token accent {
  margin: 0;
}

@theme brand {
  font-weight: 700;
}

@style card {
  mobile {
    border-width: 1px;
  }
}

@quantize layout {
  mobile {
    display: block;
  }
  desktop {
    display: grid;
  }
}
`;

    const warnings: string[] = [];
    const vitePlugin = plugin();
    vitePlugin.configResolved?.({ root } as never);

    const transformed = await vitePlugin.transform?.call(
      {
        warn(message: string) {
          warnings.push(message);
        },
      },
      css,
      cssFile,
    );

    expect(warnings).toEqual([]);
    expect(transformed).not.toBeNull();
    expect(transformed?.code).toContain('--czap-accent');
    expect(transformed?.code).toContain('html[data-theme="light"]');
    expect(transformed?.code).toContain('.card[data-state="mobile"]');
    expect(transformed?.code).toContain('@container');
  });

  test('warns and leaves css unchanged when definitions cannot be resolved', async () => {
    const root = makeTempDir();
    const cssFile = join(root, 'src', 'broken.css');
    mkdirSync(join(root, 'src'), { recursive: true });

    const warnings: string[] = [];
    const vitePlugin = plugin();
    vitePlugin.configResolved?.({ root } as never);

    const result = await vitePlugin.transform?.call(
      {
        warn(message: string) {
          warnings.push(message);
        },
      },
      '@token missing { color: red; }',
      cssFile,
    );

    expect(result).toBeNull();
    expect(warnings[0]).toContain('Could not resolve token "missing"');
  });

  test('returns null when parsed at-rules cannot be found for replacement', async () => {
    const root = makeTempDir();
    const cssFile = join(root, 'src', 'unmatched.css');
    mkdirSync(join(root, 'src'), { recursive: true });

    const token = Token.make({
      name: 'accent',
      category: 'color',
      axes: ['theme'] as const,
      values: { light: '#ffffff' },
      fallback: '#ffffff',
    });
    const theme = Theme.make({
      name: 'brand',
      variants: ['light'] as const,
      tokens: { accent: { light: '#ffffff' } },
      meta: { light: { label: 'Light', mode: 'light' } },
    });
    const style = Style.make({
      base: { properties: { color: 'var(--czap-accent)' } },
      states: { compact: { properties: { display: 'block' } } },
    });

    writeModule(join(root, 'src'), 'tokens.ts', 'accent', token);
    writeModule(join(root, 'src'), 'themes.ts', 'brand', theme);
    writeModule(join(root, 'src'), 'styles.ts', 'card', style);

    vi.spyOn(TokenTransformModule, 'parseTokenBlocks').mockReturnValue([
      { tokenName: 'accent', line: 1, declarations: {} },
    ]);
    vi.spyOn(ThemeTransformModule, 'parseThemeBlocks').mockReturnValue([
      { themeName: 'brand', line: 2, declarations: {} },
    ]);
    vi.spyOn(StyleTransformModule, 'parseStyleBlocks').mockReturnValue([
      { styleName: 'card', line: 3, states: {} },
    ]);
    vi.spyOn(TokenTransformModule, 'compileTokenBlock').mockReturnValue(':root { --czap-accent: #ffffff; }');
    vi.spyOn(ThemeTransformModule, 'compileThemeBlock').mockReturnValue('html[data-theme="light"] {}');
    vi.spyOn(StyleTransformModule, 'compileStyleBlock').mockReturnValue('.card[data-state="compact"] {}');

    const vitePlugin = plugin();
    vitePlugin.configResolved?.({ root } as never);

    const result = await vitePlugin.transform?.call(
      { warn() {} } as never,
      [
        '@token missing-block { color: red; }',
        '@theme missing-theme { color: red; }',
        '@style missing-style { compact { color: red; } }',
      ].join('\n\n'),
      cssFile,
    );

    expect(result).toBeNull();
  });

  test('handles prefix-colliding at-rule names and braces inside url() payloads', async () => {
    const root = makeTempDir();
    const cssDir = join(root, 'src');
    mkdirSync(cssDir, { recursive: true });

    const token = Token.make({
      name: 'accent',
      category: 'color',
      axes: ['theme'] as const,
      values: { light: '#ffffff' },
      fallback: '#ffffff',
    });
    const tokenExtra = Token.make({
      name: 'accentx',
      category: 'color',
      axes: ['theme'] as const,
      values: { light: '#ff00ff' },
      fallback: '#ff00ff',
    });
    const style = Style.make({
      base: {
        properties: {
          color: 'var(--czap-accent)',
        },
      },
      states: {
        compact: {
          properties: {
            background: 'black',
          },
        },
      },
    });

    writeModule(cssDir, 'tokens.ts', 'accent', token);
    writeModule(cssDir, 'extra.tokens.ts', 'accentx', tokenExtra);
    writeModule(cssDir, 'styles.ts', 'card', style);
    writeModule(
      cssDir,
      'styles.extra.ts',
      `export const cardExtra = ${JSON.stringify(style, null, 2)};\n`,
    );

    const cssFile = join(cssDir, 'collisions.css');
    const css = `
@token accentx {
  color: hotpink;
}

@token accent {
  background-image: url("data:image/svg+xml,<svg>{brace}</svg>");
}

@style card {
  compact {
    content: "{still a value}";
  }
}
`;

    const warnings: string[] = [];
    const vitePlugin = plugin();
    vitePlugin.configResolved?.({ root } as never);

    const transformed = await vitePlugin.transform?.call(
      {
        warn(message: string) {
          warnings.push(message);
        },
      },
      css,
      cssFile,
    );

    expect(warnings).toEqual([]);
    expect(transformed?.code).toContain('--czap-accent');
    expect(transformed?.code).toContain('--czap-accentx');
    expect(transformed?.code).toContain('.card[data-state="compact"]');
    expect(transformed?.code).not.toContain('@token accentx');
    expect(transformed?.code).not.toContain('@token accent {');
    expect(transformed?.code).not.toContain('@style card {');
  });

  test('handles escaped quotes inside quoted url() payloads and leaves unterminated quantize blocks unchanged', async () => {
    const root = makeTempDir();
    const cssDir = join(root, 'src');
    mkdirSync(cssDir, { recursive: true });

    const style = Style.make({
      base: {
        properties: {
          color: 'var(--czap-accent)',
        },
      },
      states: {
        compact: {
          properties: {
            background: 'url("data:text/plain,escaped\\\\\\"quote\\\\\\"")',
          },
        },
      },
    });
    const boundary = Boundary.make({
      input: 'viewport.width',
      at: [[0, 'compact']] as const,
    });

    writeModule(cssDir, 'styles.ts', 'card', style);
    writeModule(cssDir, 'boundaries.ts', 'layout', boundary);

    const vitePlugin = plugin();
    vitePlugin.configResolved?.({ root, command: 'serve' } as never);

    const transformed = await vitePlugin.transform?.call(
      { warn() {} } as never,
      '@style card { compact { background-image: url("data:text/plain,escaped\\\\\\"quote\\\\\\""); } }',
      join(cssDir, 'escaped-url.css'),
    );
    expect(transformed?.code).toContain('.czap-card');

    vi.spyOn(CSSQuantizeModule, 'parseQuantizeBlocks').mockReturnValue([
      {
        boundaryName: 'layout',
        line: 1,
        states: {
          compact: { color: 'red' },
        },
      },
    ]);
    vi.spyOn(CSSQuantizeModule, 'compileQuantizeBlock').mockReturnValue(
      '@container viewport-width (width >= 0px) { .card { color: red; } }',
    );

    await expect(
      vitePlugin.transform?.call(
        { warn() {} } as never,
        '@quantize layout { compact { color: red; }',
        join(cssDir, 'unterminated-quantize.css'),
      ),
    ).resolves.toBeNull();
  });

  test('returns affected css modules during hot updates', () => {
    const cssModule = { id: 'src/app.css' };
    const moduleGraph = {
      idToModuleMap: new Map([
        ['src/app.css', cssModule],
        ['src/panel.ts', { id: 'src/panel.ts' }],
      ]),
      getModuleById(id: string) {
        return id === 'src/app.css' ? cssModule : undefined;
      },
    };

    const vitePlugin = plugin();
    const context = { environment: { moduleGraph } };

    const defUpdate = vitePlugin.hotUpdate?.call(context as never, {
      file: 'src/panel.tokens.ts',
    } as never);
    expect(defUpdate).toEqual([cssModule]);

    const cssUpdate = vitePlugin.hotUpdate?.call(context as never, {
      file: 'src/app.css',
    } as never);
    expect(cssUpdate).toEqual([cssModule]);
  });

  test('returns nothing for missed css modules or when hmr is disabled', () => {
    const moduleGraph = {
      idToModuleMap: new Map(),
      getModuleById() {
        return undefined;
      },
    };

    const vitePlugin = plugin();
    const context = { environment: { moduleGraph } };
    expect(vitePlugin.hotUpdate?.call(context as never, { file: 'src/missing.css' } as never)).toBeUndefined();

    const noHmrPlugin = plugin({ hmr: false });
    expect(noHmrPlugin.hotUpdate?.call(context as never, { file: 'src/app.css' } as never)).toBeUndefined();
  });

  test('skips definition invalidation when no css modules are present', () => {
    const moduleGraph = {
      idToModuleMap: new Map([['src/panel.ts', { id: 'src/panel.ts' }]]),
      getModuleById() {
        return undefined;
      },
    };

    const vitePlugin = plugin();
    const context = { environment: { moduleGraph } };
    expect(vitePlugin.hotUpdate?.call(context as never, { file: 'src/tokens.ts' } as never)).toBeUndefined();
  });

  test('warns for unresolved theme, style, and boundary definitions independently', async () => {
    const root = makeTempDir();
    const cssFile = join(root, 'src', 'missing.css');
    mkdirSync(join(root, 'src'), { recursive: true });

    const warnings: string[] = [];
    const vitePlugin = plugin();
    vitePlugin.configResolved?.({ root } as never);

    await vitePlugin.transform?.call(
      {
        warn(message: string) {
          warnings.push(message);
        },
      },
      [
        '@theme missingTheme { color: red; }',
        '@style missingStyle { compact { color: blue; } }',
        '@quantize missingBoundary { compact { display: block; } }',
      ].join('\n\n'),
      cssFile,
    );

    expect(warnings).toEqual([
      expect.stringContaining('Could not resolve theme "missingTheme"'),
      expect.stringContaining('Could not resolve style "missingStyle"'),
      expect.stringContaining('Could not resolve boundary "missingBoundary"'),
    ]);
  });

  test('transforms mixed at-rules with comments, single quotes, and unquoted url braces', async () => {
    const root = makeTempDir();
    const cssDir = join(root, 'src');
    mkdirSync(cssDir, { recursive: true });

    const boundary = Boundary.make({
      input: 'viewport.width',
      at: [
        [0, 'mobile'],
        [768, 'desktop'],
      ] as const,
    });
    const token = Token.make({
      name: 'accent',
      category: 'color',
      axes: ['theme'] as const,
      values: { light: '#ffffff' },
      fallback: '#ffffff',
    });
    const theme = Theme.make({
      name: 'brand',
      variants: ['light'] as const,
      tokens: {
        accent: { light: '#ffffff' },
      },
      meta: {
        light: { label: 'Light', mode: 'light' },
      },
    });
    const style = Style.make({
      base: {
        properties: {
          color: 'var(--czap-accent)',
        },
      },
      states: {
        compact: {
          properties: {
            content: "'quoted { braces }'",
            background: 'url(data:image/svg+xml;charset=utf-8,<svg>{brace}</svg>)',
          },
        },
      },
    });

    writeModule(cssDir, 'tokens.ts', 'accent', token);
    writeModule(cssDir, 'themes.ts', 'brand', theme);
    writeModule(cssDir, 'styles.ts', 'card', style);
    writeModule(cssDir, 'boundaries.ts', 'layout', boundary);

    const cssFile = join(cssDir, 'mixed.css');
    const css = `
/* comment with { braces } should not break parsing */
@style card {
  compact {
    content: '{still a string}';
    background-image: url(data:image/svg+xml;charset=utf-8,<svg>{brace}</svg>);
  }
}

@token accent {
  content: '{token string}';
}

@quantize layout {
  mobile {
    content: '{mobile}';
  }
  desktop {
    content: '{desktop}';
  }
}

@theme brand {
  content: '{theme value}';
}
`;

    const warnings: string[] = [];
    const vitePlugin = plugin();
    vitePlugin.configResolved?.({ root } as never);

    const transformed = await vitePlugin.transform?.call(
      {
        warn(message: string) {
          warnings.push(message);
        },
      },
      css,
      cssFile,
    );

    expect(warnings).toEqual([]);
    expect(transformed?.code).toContain('--czap-accent');
    expect(transformed?.code).toContain('html[data-theme="light"]');
    expect(transformed?.code).toContain('.card[data-state="compact"]');
    expect(transformed?.code).toContain('@container');
    expect(transformed?.code).not.toContain('@style card {');
    expect(transformed?.code).not.toContain('@token accent {');
    expect(transformed?.code).not.toContain('@theme brand {');
    expect(transformed?.code).not.toContain('@quantize layout {');
  });

  test('replaces blocks cleanly when at-rule bodies contain inline comments and quoted braces', async () => {
    const root = makeTempDir();
    const cssDir = join(root, 'src');
    mkdirSync(cssDir, { recursive: true });

    const token = Token.make({
      name: 'accent',
      category: 'color',
      axes: ['theme'] as const,
      values: { light: '#ffffff' },
      fallback: '#ffffff',
    });
    const theme = Theme.make({
      name: 'brand',
      variants: ['light'] as const,
      tokens: {
        accent: { light: '#ffffff' },
      },
      meta: {
        light: { label: 'Light', mode: 'light' },
      },
    });

    writeModule(cssDir, 'tokens.ts', 'accent', token);
    writeModule(cssDir, 'themes.ts', 'brand', theme);

    const cssFile = join(cssDir, 'comments.css');
    const css = `
@token accent {
  /* comment with } braces should stay inert */
  content: "{token}";
}

@theme brand {
  /* another } comment */
  content: "{theme}";
}
`;

    const vitePlugin = plugin();
    vitePlugin.configResolved?.({ root } as never);

    const transformed = await vitePlugin.transform?.call({ warn() {} } as never, css, cssFile);

    expect(transformed?.code).toContain('--czap-accent');
    expect(transformed?.code).toContain('html[data-theme="light"]');
    expect(transformed?.code).not.toContain('@token accent {');
    expect(transformed?.code).not.toContain('@theme brand {');
  });

  test('parses quantize declarations with escaped quotes, invalid colonless lines, and trailing whitespace at EOF', () => {
    const css = `
@quantize layout {
  mobile {
    content: "say \\"hi\\"";
    invalid declaration
    color: red
  }   
}`;

    const [block] = parseQuantizeBlocks(css, 'escaped.css');
    expect(block?.states.mobile).toEqual({
      content: '"say \\"hi\\""',
    });
  });

  test('handles prefixed names, escaped strings, and nested url parens when replacing at-rule blocks', async () => {
    const root = makeTempDir();
    const cssDir = join(root, 'src');
    mkdirSync(cssDir, { recursive: true });

    const boundary = Boundary.make({
      input: 'viewport.width',
      at: [
        [0, 'mobile'],
        [768, 'desktop'],
      ] as const,
    });
    const token = Token.make({
      name: 'accent',
      category: 'color',
      axes: ['theme'] as const,
      values: { light: '#ffffff' },
      fallback: '#ffffff',
    });
    const style = Style.make({
      base: { properties: { color: 'var(--czap-accent)' } },
      states: {
        compact: {
          properties: {
            backgroundImage: 'url("data:text/plain,(nested)")',
          },
        },
      },
    });

    writeModule(cssDir, 'tokens.ts', 'accent', token);
    writeModule(cssDir, 'styles.ts', 'card', style);
    writeModule(cssDir, 'boundaries.ts', 'layout', boundary);

    const css = `
@token accent-long {
  color: hotpink;
}

@token accent {
  content: "brace \\\"{ok}\\\"";
}

@style card {
  compact {
    background-image: url(data:text/plain,(nested(paren)));
  }
}

@quantize layout {
  mobile {
    content: "mobile";
  }
}
`;

    const vitePlugin = plugin();
    vitePlugin.configResolved?.({ root, command: 'serve' } as never);
    const transformed = await vitePlugin.transform?.call({ warn() {} } as never, css, join(cssDir, 'batch.css'));

    expect(transformed?.code).toContain('--czap-accent');
    expect(transformed?.code).toContain('.card[data-state="compact"]');
    expect(transformed?.code).toContain('@container');
    expect(transformed?.code).toContain('@token accent-long');
    expect(transformed?.code).not.toContain('@token accent {');
  });

  test('replaces blocks when quoted strings contain escaped quotes during at-rule span scanning', async () => {
    const root = makeTempDir();
    const cssDir = join(root, 'src');
    mkdirSync(cssDir, { recursive: true });

    const token = Token.make({
      name: 'accent',
      category: 'color',
      axes: ['theme'] as const,
      values: { light: '#ffffff' },
      fallback: '#ffffff',
    });

    writeModule(cssDir, 'tokens.ts', 'accent', token);

    const vitePlugin = plugin();
    vitePlugin.configResolved?.({ root, command: 'serve' } as never);

    const transformed = await vitePlugin.transform?.call(
      { warn() {} } as never,
      `
@token accent {
  content: "escaped quote \\"keeps scanning\\"";
}
`,
      join(cssDir, 'escaped-block.css'),
    );

    expect(transformed?.code).toContain('--czap-accent');
    expect(transformed?.code).not.toContain('@token accent {');
  });

  test('returns affected astro and html modules during hot updates', () => {
    const astroModule = { id: 'src/page.astro' };
    const htmlModule = { id: 'src/index.html' };
    const moduleGraph = {
      idToModuleMap: new Map([
        ['src/page.astro', astroModule],
        ['src/index.html', htmlModule],
        ['src/panel.ts', { id: 'src/panel.ts' }],
      ]),
      getModuleById(id: string) {
        if (id === 'src/page.astro') return astroModule;
        if (id === 'src/index.html') return htmlModule;
        return undefined;
      },
    };

    const vitePlugin = plugin();
    const context = { environment: { moduleGraph } };

    const defUpdate = vitePlugin.hotUpdate?.call(context as never, {
      file: 'src/panel.styles.ts',
    } as never);
    expect(defUpdate).toEqual([astroModule, htmlModule]);

    const astroUpdate = vitePlugin.hotUpdate?.call(context as never, {
      file: 'src/page.astro',
    } as never);
    expect(astroUpdate).toEqual([astroModule]);

    const htmlUpdate = vitePlugin.hotUpdate?.call(context as never, {
      file: 'src/index.html',
    } as never);
    expect(htmlUpdate).toEqual([htmlModule]);
  });
});
