/**
 * Config.make() — content addressing, projections, freezing.
 * Bang 1: all tests fail because Config.make throws 'not implemented'.
 */

import { describe, test, expect } from 'vitest';
import { Boundary } from '@czap/core';
import { Config, defineConfig } from '@czap/core';

const boundary = Boundary.make({
  input: 'viewport.width',
  at: [[0, 'mobile'], [768, 'desktop']] as const,
});

describe('Config.make()', () => {
  test('returns a frozen object with _tag ConfigDef', () => {
    const cfg = Config.make({ boundaries: { viewport: boundary } });
    expect(cfg._tag).toBe('ConfigDef');
    expect(Object.isFrozen(cfg)).toBe(true);
  });

  test('id is a ContentAddress (fnv1a: prefix)', () => {
    const cfg = Config.make({ boundaries: { viewport: boundary } });
    expect(cfg.id).toMatch(/^fnv1a:[0-9a-f]{8}$/);
  });

  test('same input → same id (determinism)', () => {
    const input = { boundaries: { viewport: boundary } };
    const c1 = Config.make(input);
    const c2 = Config.make(input);
    expect(c1.id).toBe(c2.id);
  });

  test('different input → different id', () => {
    const c1 = Config.make({ boundaries: { a: boundary } });
    const c2 = Config.make({ boundaries: { b: boundary } });
    expect(c1.id).not.toBe(c2.id);
  });

  test('empty input defaults all collections to {}', () => {
    const cfg = Config.make({});
    expect(cfg.boundaries).toEqual({});
    expect(cfg.tokens).toEqual({});
    expect(cfg.themes).toEqual({});
    expect(cfg.styles).toEqual({});
  });

  test('defineConfig() is an alias for Config.make()', () => {
    const input = { boundaries: { viewport: boundary } };
    const cfg1 = Config.make(input);
    const cfg2 = defineConfig(input);
    expect(cfg1.id).toBe(cfg2.id);
  });
});

describe('Config.toViteConfig()', () => {
  test('maps dirs from vite.dirs', () => {
    const cfg = Config.make({ vite: { dirs: { boundary: '/custom/path' } } });
    const vite = Config.toViteConfig(cfg);
    expect(vite.dirs?.boundary).toBe('/custom/path');
  });

  test('returns PluginConfig without dirs when not set', () => {
    const cfg = Config.make({});
    const vite = Config.toViteConfig(cfg);
    expect(vite.dirs).toBeUndefined();
  });

  test('maps hmr, environments, and wasm when present', () => {
    const cfg = Config.make({
      vite: { hmr: false, environments: ['browser', 'server'], wasm: { enabled: true, path: '/wasm' } },
    });
    const vite = Config.toViteConfig(cfg);
    expect(vite.hmr).toBe(false);
    expect(vite.environments).toEqual(['browser', 'server']);
    expect(vite.wasm).toEqual({ enabled: true, path: '/wasm' });
  });

  test('omits undefined vite fields', () => {
    const cfg = Config.make({ vite: { hmr: true } });
    const vite = Config.toViteConfig(cfg);
    expect(vite.dirs).toBeUndefined();
    expect(vite.environments).toBeUndefined();
    expect(vite.wasm).toBeUndefined();
  });
});

describe('Config.toAstroConfig()', () => {
  test('maps satellite field', () => {
    const cfg = Config.make({ astro: { satellite: true } });
    const astro = Config.toAstroConfig(cfg);
    expect(astro.satellite).toBe(true);
  });

  test('maps edgeRuntime when present', () => {
    const cfg = Config.make({ astro: { edgeRuntime: true } });
    expect(Config.toAstroConfig(cfg).edgeRuntime).toBe(true);
  });

  test('omits undefined astro fields', () => {
    const cfg = Config.make({ astro: { satellite: false } });
    expect(Config.toAstroConfig(cfg).edgeRuntime).toBeUndefined();
  });
});

describe('Config.toTestAliases()', () => {
  test('returns @czap/core alias pointing to packages/core', () => {
    const cfg = Config.make({});
    const aliases = Config.toTestAliases(cfg, '/repo');
    expect(aliases['@czap/core']).toContain('packages/core');
  });

  test('returns @czap/vite alias pointing to packages/vite', () => {
    const cfg = Config.make({});
    const aliases = Config.toTestAliases(cfg, '/repo');
    expect(aliases['@czap/vite']).toContain('packages/vite');
  });

  test('includes @czap/_spine alias', () => {
    const cfg = Config.make({});
    const aliases = Config.toTestAliases(cfg, '/repo');
    expect(aliases['@czap/_spine']).toContain('packages/_spine');
  });
});
