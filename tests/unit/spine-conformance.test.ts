/**
 * Spine conformance — runtime existence + type-level structural checks.
 *
 * Bang 2: full checks including @czap/_spine type imports.
 */

import { describe, test, expect } from 'vitest';
import type * as SpineCore from '@czap/_spine';
import * as CoreImpl from '@czap/core';
import * as ViteImpl from '@czap/vite';
import * as CompilerImpl from '@czap/compiler';

// ─────────────────────────────────────────────────────────────────────────────
// Type-level conformance: implementation satisfies spine contract
// ─────────────────────────────────────────────────────────────────────────────

// If these lines produce a TypeScript error, the implementation diverged from the spine.
const _coreConfig: SpineCore.Config.Shape = CoreImpl.Config.make({});
const _plugin: ReturnType<typeof CoreImpl.defineConfig> = CoreImpl.defineConfig({});
void _coreConfig;
void _plugin;

// ─────────────────────────────────────────────────────────────────────────────
// Runtime existence checks
// ─────────────────────────────────────────────────────────────────────────────

describe('spine conformance — @czap/core', () => {
  test('Config.make exported and callable', () => {
    expect(typeof CoreImpl.Config.make).toBe('function');
    const cfg = CoreImpl.Config.make({});
    expect(cfg._tag).toBe('ConfigDef');
    expect(cfg.id).toMatch(/^fnv1a:/);
  });

  test('Config.toViteConfig exported and callable', () => {
    expect(typeof CoreImpl.Config.toViteConfig).toBe('function');
    const cfg = CoreImpl.Config.make({});
    expect(CoreImpl.Config.toViteConfig(cfg)).toBeDefined();
  });

  test('defineConfig exported and callable', () => {
    expect(typeof CoreImpl.defineConfig).toBe('function');
  });

  test('Boundary exported from @czap/core (regression guard)', () => {
    expect(typeof CoreImpl.Boundary.make).toBe('function');
  });
});

describe('spine conformance — @czap/vite', () => {
  test('resolvePrimitive exported and callable', () => {
    expect(typeof ViteImpl.resolvePrimitive).toBe('function');
  });

  test('plugin exported and callable', () => {
    expect(typeof ViteImpl.plugin).toBe('function');
  });
});

describe('spine conformance — @czap/compiler', () => {
  test('dispatch exported and callable', () => {
    expect(typeof CompilerImpl.dispatch).toBe('function');
  });

});
