import { afterEach, describe, expect, test, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Diagnostics } from '@czap/core';
import { resolveWASM } from '../../../packages/vite/src/wasm-resolve.js';
import { fileExists, findConventionFiles } from '../../../packages/vite/src/resolve-fs.js';
import { resolvePrimitive } from '../../../packages/vite/src/primitive-resolve.js';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'czap-resolve-'));
  tempDirs.push(dir);
  return dir;
}

function writeModule(dir: string, fileName: string, source: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, fileName), source);
}

afterEach(() => {
  Diagnostics.reset();
  vi.restoreAllMocks();
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe('@czap/vite resolvers', () => {
  test('resolves from same-directory convention files', async () => {
    const root = makeTempDir();
    const sourceDir = join(root, 'src');

    writeModule(sourceDir, 'tokens.ts', `export const accent = { _tag: 'TokenDef', id: 'tok', name: 'accent' };`);
    writeModule(sourceDir, 'themes.ts', `export const brand = { _tag: 'ThemeDef', id: 'theme', name: 'brand' };`);
    writeModule(
      sourceDir,
      'styles.ts',
      `export const card = { _tag: 'StyleDef', id: 'style', boundary: {}, base: { properties: {} }, states: {} };`,
    );
    writeModule(
      sourceDir,
      'boundaries.ts',
      `export const layout = { _tag: 'BoundaryDef', id: 'boundary', input: 'viewport.width', thresholds: [0], states: ['mobile'] };`,
    );

    const fromFile = join(sourceDir, 'panel.css');

    expect((await resolvePrimitive('token', 'accent', fromFile, root))?.source).toContain('tokens.ts');
    expect((await resolvePrimitive('theme', 'brand', fromFile, root))?.source).toContain('themes.ts');
    expect((await resolvePrimitive('style', 'card', fromFile, root))?.source).toContain('styles.ts');
    expect((await resolvePrimitive('boundary', 'layout', fromFile, root))?.source).toContain('boundaries.ts');
  });

  test('falls back to wildcard files and project-root files', async () => {
    const root = makeTempDir();
    const sourceDir = join(root, 'src', 'components');
    mkdirSync(sourceDir, { recursive: true });

    writeModule(root, 'design.tokens.ts', `export const accent = { _tag: 'TokenDef', id: 'tok', name: 'accent' };`);
    writeModule(root, 'design.themes.ts', `export const brand = { _tag: 'ThemeDef', id: 'theme', name: 'brand' };`);
    writeModule(
      root,
      'design.styles.ts',
      `export const card = { _tag: 'StyleDef', id: 'style', boundary: {}, base: { properties: {} }, states: {} };`,
    );
    writeModule(
      root,
      'layout.boundaries.ts',
      `export const layout = { _tag: 'BoundaryDef', id: 'boundary', input: 'viewport.width', thresholds: [0], states: ['mobile'] };`,
    );

    const fromFile = join(sourceDir, 'panel.css');

    expect((await resolvePrimitive('token', 'accent', fromFile, root))?.source).toContain('design.tokens.ts');
    expect((await resolvePrimitive('theme', 'brand', fromFile, root))?.source).toContain('design.themes.ts');
    expect((await resolvePrimitive('style', 'card', fromFile, root))?.source).toContain('design.styles.ts');
    expect((await resolvePrimitive('boundary', 'layout', fromFile, root))?.source).toContain('layout.boundaries.ts');
  });

  test('falls back to exact project-root convention files when source siblings are absent', async () => {
    const root = makeTempDir();
    const sourceDir = join(root, 'src', 'components');
    mkdirSync(sourceDir, { recursive: true });

    writeModule(root, 'tokens.ts', `export const accent = { _tag: 'TokenDef', id: 'tok', name: 'accent' };`);
    writeModule(root, 'themes.ts', `export const brand = { _tag: 'ThemeDef', id: 'theme', name: 'brand' };`);
    writeModule(
      root,
      'styles.ts',
      `export const card = { _tag: 'StyleDef', id: 'style', boundary: {}, base: { properties: {} }, states: {} };`,
    );
    writeModule(
      root,
      'boundaries.ts',
      `export const layout = { _tag: 'BoundaryDef', id: 'boundary', input: 'viewport.width', thresholds: [0], states: ['mobile'] };`,
    );

    const fromFile = join(sourceDir, 'panel.css');

    expect((await resolvePrimitive('token', 'accent', fromFile, root))?.source).toContain('tokens.ts');
    expect((await resolvePrimitive('theme', 'brand', fromFile, root))?.source).toContain('themes.ts');
    expect((await resolvePrimitive('style', 'card', fromFile, root))?.source).toContain('styles.ts');
    expect((await resolvePrimitive('boundary', 'layout', fromFile, root))?.source).toContain('boundaries.ts');
  });

  test('continues from an exact same-directory theme file with a missing export into wildcard matches', async () => {
    const root = makeTempDir();
    const sourceDir = join(root, 'src');
    const fromFile = join(sourceDir, 'panel.css');
    mkdirSync(sourceDir, { recursive: true });

    writeModule(sourceDir, 'themes.ts', `export const other = { _tag: 'ThemeDef', id: 'theme', name: 'other' };`);
    writeModule(sourceDir, 'feature.themes.ts', `export const brand = { _tag: 'ThemeDef', id: 'theme', name: 'brand' };`);

    expect((await resolvePrimitive('theme', 'brand', fromFile, root))?.source).toContain('feature.themes.ts');
  });

  test('continues from an exact project-root theme file with a missing export into wildcard root matches', async () => {
    const root = makeTempDir();
    const sourceDir = join(root, 'src');
    const fromFile = join(sourceDir, 'panel.css');
    mkdirSync(sourceDir, { recursive: true });

    writeModule(root, 'themes.ts', `export const other = { _tag: 'ThemeDef', id: 'theme', name: 'other' };`);
    writeModule(root, 'fallback.themes.ts', `export const brand = { _tag: 'ThemeDef', id: 'theme', name: 'brand' };`);

    expect((await resolvePrimitive('theme', 'brand', fromFile, root))?.source).toContain('fallback.themes.ts');
  });

  test('resolves themes from wildcard conventions when exact convention files are absent', async () => {
    const root = makeTempDir();
    const sourceDir = join(root, 'src', 'components');
    const fromFile = join(sourceDir, 'panel.css');
    mkdirSync(sourceDir, { recursive: true });

    writeModule(sourceDir, 'feature.themes.ts', `export const local = { _tag: 'ThemeDef', id: 'theme', name: 'local' };`);
    writeModule(root, 'brand.themes.ts', `export const remote = { _tag: 'ThemeDef', id: 'theme', name: 'remote' };`);

    expect((await resolvePrimitive('theme', 'local', fromFile, root))?.source).toContain('feature.themes.ts');
    expect((await resolvePrimitive('theme', 'remote', fromFile, root))?.source).toContain('brand.themes.ts');
  });

  test('skips invalid wildcard and exact root matches before using project-root wildcard modules', async () => {
    const root = makeTempDir();
    const sourceDir = join(root, 'src', 'components');
    mkdirSync(sourceDir, { recursive: true });

    writeModule(sourceDir, 'feature.tokens.ts', `export const accent = { _tag: 'WrongTag', id: 'tok' };`);
    writeModule(sourceDir, 'feature.styles.ts', `export const card = { _tag: 'WrongTag', id: 'style' };`);
    writeModule(sourceDir, 'feature.boundaries.ts', `export const layout = { _tag: 'WrongTag', id: 'boundary' };`);

    writeModule(root, 'tokens.ts', `export const accent = false;`);
    writeModule(root, 'styles.ts', `export const card = ['not-a-style'];`);
    writeModule(root, 'boundaries.ts', `export const layout = 0;`);

    writeModule(root, 'final.tokens.ts', `export const accent = { _tag: 'TokenDef', id: 'tok', name: 'accent' };`);
    writeModule(
      root,
      'final.styles.ts',
      `export const card = { _tag: 'StyleDef', id: 'style', boundary: {}, base: { properties: {} }, states: {} };`,
    );
    writeModule(
      root,
      'final.boundaries.ts',
      `export const layout = { _tag: 'BoundaryDef', id: 'boundary', input: 'viewport.width', thresholds: [0], states: ['mobile'] };`,
    );

    const fromFile = join(sourceDir, 'panel.css');

    expect((await resolvePrimitive('token', 'accent', fromFile, root))?.source).toContain('final.tokens.ts');
    expect((await resolvePrimitive('style', 'card', fromFile, root))?.source).toContain('final.styles.ts');
    expect((await resolvePrimitive('boundary', 'layout', fromFile, root))?.source).toContain('final.boundaries.ts');
  });

  test('returns null when nothing matches', async () => {
    const root = makeTempDir();
    const fromFile = join(root, 'src', 'missing.css');
    mkdirSync(join(root, 'src'), { recursive: true });

    await expect(resolvePrimitive('token', 'missing', fromFile, root)).resolves.toBeNull();
    await expect(resolvePrimitive('theme', 'missing', fromFile, root)).resolves.toBeNull();
    await expect(resolvePrimitive('style', 'missing', fromFile, root)).resolves.toBeNull();
    await expect(resolvePrimitive('boundary', 'missing', fromFile, root)).resolves.toBeNull();
  });

  test('returns null after exhausting root wildcard files that exist but do not export the requested defs', async () => {
    const root = makeTempDir();
    const fromFile = join(root, 'src', 'panel.css');
    mkdirSync(join(root, 'src'), { recursive: true });

    writeModule(root, 'fallback.tokens.ts', `export const other = { _tag: 'TokenDef', id: 'tok', name: 'other' };`);
    writeModule(root, 'fallback.themes.ts', `export const other = { _tag: 'ThemeDef', id: 'theme', name: 'other' };`);
    writeModule(
      root,
      'fallback.styles.ts',
      `export const other = { _tag: 'StyleDef', id: 'style', boundary: {}, base: { properties: {} }, states: {} };`,
    );
    writeModule(
      root,
      'fallback.boundaries.ts',
      `export const other = { _tag: 'BoundaryDef', id: 'boundary', input: 'viewport.width', thresholds: [0], states: ['mobile'] };`,
    );

    await expect(resolvePrimitive('token', 'accent', fromFile, root)).resolves.toBeNull();
    await expect(resolvePrimitive('theme', 'brand', fromFile, root)).resolves.toBeNull();
    await expect(resolvePrimitive('style', 'card', fromFile, root)).resolves.toBeNull();
    await expect(resolvePrimitive('boundary', 'layout', fromFile, root)).resolves.toBeNull();
  });

  test('resolves boundary definitions from project-root wildcard conventions when exact root files are absent', async () => {
    const root = makeTempDir();
    const fromFile = join(root, 'src', 'panel.css');
    mkdirSync(join(root, 'src'), { recursive: true });

    writeModule(
      root,
      'feature.boundaries.ts',
      `export const layout = { _tag: 'BoundaryDef', id: 'boundary', input: 'viewport.width', thresholds: [0], states: ['mobile'] };`,
    );

    await expect(resolvePrimitive('boundary', 'layout', fromFile, root)).resolves.toMatchObject({
      source: join(root, 'feature.boundaries.ts'),
    });
  });

  test('continues from an exact same-directory boundary file with a missing export into wildcard matches', async () => {
    const root = makeTempDir();
    const sourceDir = join(root, 'src');
    const fromFile = join(sourceDir, 'panel.css');
    mkdirSync(sourceDir, { recursive: true });

    writeModule(
      sourceDir,
      'boundaries.ts',
      `export const other = { _tag: 'BoundaryDef', id: 'boundary', input: 'viewport.width', thresholds: [0], states: ['mobile'] };`,
    );
    writeModule(
      sourceDir,
      'feature.boundaries.ts',
      `export const layout = { _tag: 'BoundaryDef', id: 'boundary', input: 'viewport.width', thresholds: [0], states: ['mobile'] };`,
    );

    expect((await resolvePrimitive('boundary', 'layout', fromFile, root))?.source).toContain('feature.boundaries.ts');
  });

  test('routes boundary import failures through diagnostics and continues into wildcard matches', async () => {
    const root = makeTempDir();
    const sourceDir = join(root, 'src');
    const fromFile = join(sourceDir, 'panel.css');
    mkdirSync(sourceDir, { recursive: true });

    writeModule(sourceDir, 'boundaries.ts', `throw new Error('boom');`);
    writeModule(
      sourceDir,
      'feature.boundaries.ts',
      `export const layout = { _tag: 'BoundaryDef', id: 'boundary', input: 'viewport.width', thresholds: [0], states: ['mobile'] };`,
    );

    const { sink, events } = Diagnostics.createBufferSink();
    Diagnostics.setSink(sink);

    const resolved = await resolvePrimitive('boundary', 'layout', fromFile, root);
    expect(resolved?.source).toContain('feature.boundaries.ts');
    expect(events).toEqual([
      expect.objectContaining({
        level: 'warn',
        source: 'czap/vite.boundary-resolve',
        code: 'import-failed',
        message: expect.stringContaining('Failed to import'),
      }),
    ]);
  });

  test('routes import failures through diagnostics and continues searching', async () => {
    const root = makeTempDir();
    const sourceDir = join(root, 'src');
    const fromFile = join(sourceDir, 'panel.css');
    mkdirSync(sourceDir, { recursive: true });

    writeModule(sourceDir, 'tokens.ts', `throw new Error('boom');`);
    writeModule(root, 'fallback.tokens.ts', `export const accent = { _tag: 'TokenDef', id: 'tok', name: 'accent' };`);

    const { sink, events } = Diagnostics.createBufferSink();
    Diagnostics.setSink(sink);

    const resolved = await resolvePrimitive('token', 'accent', fromFile, root);
    expect(resolved?.source).toContain('fallback.tokens.ts');
    expect(events).toEqual([
      expect.objectContaining({
        level: 'warn',
        source: 'czap/vite.token-resolve',
        code: 'import-failed',
        message: expect.stringContaining('Failed to import'),
      }),
    ]);
  });

  test('ignores wrong export tags and continues searching later conventions', async () => {
    const root = makeTempDir();
    const sourceDir = join(root, 'src');
    const fromFile = join(sourceDir, 'panel.css');
    mkdirSync(sourceDir, { recursive: true });

    writeModule(sourceDir, 'tokens.ts', `export const accent = { _tag: 'WrongTag', id: 'tok', name: 'accent' };`);
    writeModule(sourceDir, 'themes.ts', `export const brand = { _tag: 'WrongTag', id: 'theme', name: 'brand' };`);
    writeModule(sourceDir, 'styles.ts', `export const card = { _tag: 'WrongTag', id: 'style' };`);
    writeModule(sourceDir, 'boundaries.ts', `export const layout = { _tag: 'WrongTag', id: 'boundary' };`);

    writeModule(root, 'fallback.tokens.ts', `export const accent = { _tag: 'TokenDef', id: 'tok', name: 'accent' };`);
    writeModule(root, 'fallback.themes.ts', `export const brand = { _tag: 'ThemeDef', id: 'theme', name: 'brand' };`);
    writeModule(
      root,
      'fallback.styles.ts',
      `export const card = { _tag: 'StyleDef', id: 'style', boundary: {}, base: { properties: {} }, states: {} };`,
    );
    writeModule(
      root,
      'fallback.boundaries.ts',
      `export const layout = { _tag: 'BoundaryDef', id: 'boundary', input: 'viewport.width', thresholds: [0], states: ['mobile'] };`,
    );

    expect((await resolvePrimitive('token', 'accent', fromFile, root))?.source).toContain('fallback.tokens.ts');
    expect((await resolvePrimitive('theme', 'brand', fromFile, root))?.source).toContain('fallback.themes.ts');
    expect((await resolvePrimitive('style', 'card', fromFile, root))?.source).toContain('fallback.styles.ts');
    expect((await resolvePrimitive('boundary', 'layout', fromFile, root))?.source).toContain('fallback.boundaries.ts');
  });

  test('ignores primitive exports and continues searching later exact-name matches', async () => {
    const root = makeTempDir();
    const sourceDir = join(root, 'src');
    const fromFile = join(sourceDir, 'panel.css');
    mkdirSync(sourceDir, { recursive: true });

    writeModule(sourceDir, 'tokens.ts', `export const accent = 'not-a-token';`);
    writeModule(sourceDir, 'themes.ts', `export const brand = 123;`);
    writeModule(sourceDir, 'styles.ts', `export const card = ['not-a-style'];`);
    writeModule(sourceDir, 'boundaries.ts', `export const layout = false;`);

    writeModule(root, 'fallback.tokens.ts', `export const accent = { _tag: 'TokenDef', id: 'tok', name: 'accent' };`);
    writeModule(root, 'fallback.themes.ts', `export const brand = { _tag: 'ThemeDef', id: 'theme', name: 'brand' };`);
    writeModule(
      root,
      'fallback.styles.ts',
      `export const card = { _tag: 'StyleDef', id: 'style', boundary: {}, base: { properties: {} }, states: {} };`,
    );
    writeModule(
      root,
      'fallback.boundaries.ts',
      `export const layout = { _tag: 'BoundaryDef', id: 'boundary', input: 'viewport.width', thresholds: [0], states: ['mobile'] };`,
    );

    expect((await resolvePrimitive('token', 'accent', fromFile, root))?.source).toContain('fallback.tokens.ts');
    expect((await resolvePrimitive('theme', 'brand', fromFile, root))?.source).toContain('fallback.themes.ts');
    expect((await resolvePrimitive('style', 'card', fromFile, root))?.source).toContain('fallback.styles.ts');
    expect((await resolvePrimitive('boundary', 'layout', fromFile, root))?.source).toContain('fallback.boundaries.ts');
  });
});

describe('@czap/vite resolveWASM', () => {
  test('prefers an explicit config path', () => {
    const root = makeTempDir();
    const configured = join(root, 'bin', 'custom.wasm');
    mkdirSync(join(root, 'bin'), { recursive: true });
    writeFileSync(configured, 'wasm');

    expect(resolveWASM(root, 'bin/custom.wasm')).toEqual({
      filePath: configured,
      source: 'config',
    });
  });

  test('falls back to crate output and public output', () => {
    const root = makeTempDir();
    const cratePath = join(root, 'crates/czap-compute/target/wasm32-unknown-unknown/release');
    mkdirSync(cratePath, { recursive: true });
    writeFileSync(join(cratePath, 'czap_compute.wasm'), 'crate');

    expect(resolveWASM(root)?.source).toBe('crate');

    rmSync(join(cratePath, 'czap_compute.wasm'));
    const publicDir = join(root, 'public');
    mkdirSync(publicDir, { recursive: true });
    writeFileSync(join(publicDir, 'czap-compute.wasm'), 'public');

    expect(resolveWASM(root)?.source).toBe('public');
  });

  test('falls back from a missing configured wasm path to the crate output', () => {
    const root = makeTempDir();
    const cratePath = join(root, 'crates/czap-compute/target/wasm32-unknown-unknown/release');
    mkdirSync(cratePath, { recursive: true });
    writeFileSync(join(cratePath, 'czap_compute.wasm'), 'crate');

    expect(resolveWASM(root, 'missing/custom.wasm')).toEqual({
      filePath: join(cratePath, 'czap_compute.wasm'),
      source: 'crate',
    });
  });

  test('returns null when no wasm binary is available', () => {
    expect(resolveWASM(makeTempDir())).toBeNull();
  });

  test('surfaces unexpected filesystem failures through diagnostics instead of collapsing to a miss', () => {
    const { sink, events } = Diagnostics.createBufferSink();
    Diagnostics.setSink(sink);

    expect(() => fileExists(42 as unknown as string, 'czap/vite.test')).toThrow(TypeError);
    expect(events).toEqual([
      expect.objectContaining({
        level: 'warn',
        source: 'czap/vite.test',
        code: 'filesystem-stat-failed',
      }),
    ]);
  });

  test('fileExists returns false for a directory path', () => {
    const root = makeTempDir();
    const dir = join(root, 'subdir');
    mkdirSync(dir, { recursive: true });

    expect(fileExists(dir, 'czap/vite.test')).toBe(false);
  });

  test('findConventionFiles returns empty array for missing directory', () => {
    const result = findConventionFiles('/nonexistent-czap-dir-' + Date.now(), '.tokens.ts', 'czap/vite.test');
    expect(result).toEqual([]);
  });

  test('findConventionFiles surfaces unexpected readdir failures through diagnostics', () => {
    const { sink, events } = Diagnostics.createBufferSink();
    Diagnostics.setSink(sink);

    expect(() => findConventionFiles(42 as unknown as string, '.tokens.ts', 'czap/vite.test')).toThrow(TypeError);
    expect(events).toEqual([
      expect.objectContaining({
        level: 'warn',
        source: 'czap/vite.test',
        code: 'filesystem-readdir-failed',
      }),
    ]);
  });

  test('findConventionFiles filters and joins matching entries', () => {
    const root = makeTempDir();
    writeFileSync(join(root, 'design.tokens.ts'), 'export const x = 1;');
    writeFileSync(join(root, 'other.ts'), 'export const y = 2;');
    writeFileSync(join(root, 'theme.tokens.ts'), 'export const z = 3;');

    const result = findConventionFiles(root, '.tokens.ts', 'czap/vite.test');
    expect(result).toHaveLength(2);
    expect(result.every((f: string) => f.endsWith('.tokens.ts'))).toBe(true);
  });
});

describe('resolvePrimitive() — generic resolver', () => {
  test.each(['boundary', 'token', 'theme', 'style'] as const)(
    'returns null for %s when no convention file exists',
    async (kind) => {
      const root = makeTempDir();
      const fromFile = join(root, 'src', 'panel.css');
      mkdirSync(join(root, 'src'), { recursive: true });

      const resolution = await resolvePrimitive(kind, 'nonexistent', fromFile, root);
      expect(resolution).toBeNull();
    },
  );

  test.each(['boundary', 'token', 'theme', 'style'] as const)(
    'resolves %s from same-dir convention file',
    async (kind) => {
      const root = makeTempDir();
      const sourceDir = join(root, 'src');
      const fromFile = join(sourceDir, 'panel.css');
      mkdirSync(sourceDir, { recursive: true });

      const tagMap = { boundary: 'BoundaryDef', token: 'TokenDef', theme: 'ThemeDef', style: 'StyleDef' } as const;
      const fileMap = { boundary: 'boundaries.ts', token: 'tokens.ts', theme: 'themes.ts', style: 'styles.ts' } as const;
      const tag = tagMap[kind];
      const file = fileMap[kind];

      writeModule(sourceDir, file, `export const primary = { _tag: '${tag}', id: '${kind}' };`);

      const resolution = await resolvePrimitive(kind, 'primary', fromFile, root);
      expect(resolution).not.toBeNull();
      expect(resolution?.source).toContain(file);
      expect(resolution?.primitive).toMatchObject({ _tag: tag });
    },
  );

  test('resolves from projectRoot when fromFile is at root level (sourceDir === projectRoot)', async () => {
    const root = makeTempDir();
    // fromFile is directly in root, so sourceDir === projectRoot → skip sourceDir push
    const fromFile = join(root, 'panel.css');
    writeModule(root, 'boundaries.ts', `export const viewport = { _tag: 'BoundaryDef', id: 'b' };`);

    const resolution = await resolvePrimitive('boundary', 'viewport', fromFile, root);
    expect(resolution).not.toBeNull();
    expect(resolution?.primitive).toMatchObject({ _tag: 'BoundaryDef' });
  });

  test('resolves from userDir when provided', async () => {
    const root = makeTempDir();
    const userDir = join(root, 'design');
    const fromFile = join(root, 'src', 'panel.css');
    mkdirSync(join(root, 'src'), { recursive: true });

    writeModule(userDir, 'tokens.ts', `export const accent = { _tag: 'TokenDef', id: 'tok', name: 'accent' };`);

    const resolution = await resolvePrimitive('token', 'accent', fromFile, root, userDir);
    expect(resolution).not.toBeNull();
    expect(resolution?.source).toContain(userDir);
    expect(resolution?.primitive).toMatchObject({ _tag: 'TokenDef' });
  });
});
