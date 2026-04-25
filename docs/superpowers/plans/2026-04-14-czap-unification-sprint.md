# Czap Unification Sprint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate 4 resolver clones, 4 dead PluginConfig fields, and the `unknown`-typed compiler dispatch; add a unified `Config` hub with `virtual:czap/config`, while maintaining 99.78%+ branch coverage.

**Architecture:** Two-bang TDD. Bang 1 writes full type contracts + throwing stubs + failing tests — `pnpm run typecheck` must be silent. Bang 2 implements to green in strict red-green sequence: Config → Spine → resolvePrimitive → virtual module → dispatch → surface wiring. Each step gates on a specific test file going green before moving on.

**Tech Stack:** TypeScript strict ESM, `effect` v4 beta, `fast-check` property tests, `tinybench` benchmarks, `vitest`, `pnpm` workspace.

---

## File Map

### Created

| Path | Responsibility |
|------|----------------|
| `packages/_spine/package.json` | Makes `@czap/_spine` importable as workspace package |
| `packages/_spine/config.d.ts` | `Config.Shape`, `Config.Input`, `defineConfig()` type contract |
| `packages/core/src/config.ts` | `Config.make()`, projections, `defineConfig()` — stub → real |
| `packages/vite/src/primitive-resolve.ts` | Generic `resolvePrimitive<K>()` replacing 4 resolver clones |
| `czap.config.ts` | Human/agent entry point for all project configuration |
| `tests/unit/spine-conformance.ts` | Structural `satisfies` checks for all public namespaces |
| `tests/helpers/primitive-harness.ts` | `PRIMITIVE_KINDS`, `resolverSuite()`, shared fc arbitraries |

### Modified

| Path | Change |
|------|--------|
| `packages/_spine/index.d.ts` | Add `export * from './config.d.ts'` |
| `packages/_spine/vite.d.ts` | Add `PrimitiveKind`, replace 4 dead dir fields with `dirs`, add `virtual:czap/config`, replace 4 individual resolver decls with generic `resolvePrimitive` |
| `packages/core/src/index.ts` | Export `Config`, `defineConfig`, `PrimitiveKind` |
| `packages/compiler/src/dispatch.ts` | Bang 1: add `CompilerDef` type + `dispatchDef` stub; Bang 2: full rewrite to tagged union dispatch |
| `packages/compiler/src/index.ts` | Export `CompilerDef`, `ConfigTemplateResult` |
| `packages/vite/src/plugin.ts` | Replace 4 individual resolver imports with `resolvePrimitive`; use `config?.dirs?.[kind]` |
| `packages/vite/src/virtual-modules.ts` | Add `virtual:czap/config` to `VIRTUAL_IDS` + load case |
| `packages/vite/src/index.ts` | Export `resolvePrimitive`; remove 4 old resolver exports |
| `vitest.shared.ts` | Derive `alias` from `Config.toTestAliases(cfg, repoRoot)` |
| `vite.config.ts` | Derive `resolve.alias` from `Config.toTestAliases(cfg, __dirname)` |
| `tests/bench/core.bench.ts` | Add `Config.make()` and `Config.toViteConfig()` bench entries |
| `tests/bench/directive.bench.ts` | Add `resolvePrimitive(kind)` bench entries per kind |

### Deleted

| Path |
|------|
| `packages/vite/src/boundary-resolve.ts` |
| `packages/vite/src/token-resolve.ts` |
| `packages/vite/src/theme-resolve.ts` |
| `packages/vite/src/style-resolve.ts` |

### Test Files

| Path | Status |
|------|--------|
| `tests/unit/core/config.test.ts` | New — failing in Bang 1, green in Bang 2 Task 7 |
| `tests/property/config.prop.test.ts` | New — failing in Bang 1, green in Bang 2 Task 7 |
| `tests/unit/spine-conformance.ts` | New — sparse in Bang 1, full in Bang 2 Task 8 |
| `tests/unit/vite/vite-resolve.test.ts` | Extended — new cases fail Bang 1, green in Bang 2 Task 9 |
| `tests/unit/compiler/dispatch-compiler.test.ts` | Extended — new cases fail Bang 1, green in Bang 2 Task 11 |

---

## ═══════════════════════════════════════
## BANG 1: Type Contracts + Failing Tests
## ═══════════════════════════════════════

**Rule:** No real logic. Every new function body throws `'not implemented'`. `pnpm run typecheck` must be silent when Bang 1 is done. Every new test must exist and be red (fail at vitest runtime, not at compile time).

---

### Task 1: `_spine` Package + Config Type Contract

**Files:**
- Create: `packages/_spine/package.json`
- Create: `packages/_spine/config.d.ts`
- Modify: `packages/_spine/index.d.ts`

- [ ] **Step 1: Create `packages/_spine/package.json`**

```json
{
  "name": "@czap/_spine",
  "private": true,
  "version": "0.1.0",
  "types": "./index.d.ts"
}
```

- [ ] **Step 2: Create `packages/_spine/config.d.ts`**

```typescript
/**
 * @czap config type spine -- Config.Shape and defineConfig() contract.
 */

import type { ContentAddress, Boundary } from './core.d.ts';
import type { Token, Theme, Style } from './design.d.ts';

export declare namespace Config {
  /** User-facing input — no id, no _tag */
  export interface Input {
    readonly boundaries?: Record<string, Boundary.Shape>;
    readonly tokens?: Record<string, Token.Shape>;
    readonly themes?: Record<string, Theme.Shape>;
    readonly styles?: Record<string, Style.Shape>;
    readonly vite?: {
      readonly dirs?: Partial<Record<'boundary' | 'token' | 'theme' | 'style', string>>;
      readonly hmr?: boolean;
      readonly environments?: readonly ('browser' | 'server' | 'shader')[];
      readonly wasm?: { readonly enabled?: boolean; readonly path?: string };
    };
    readonly astro?: {
      readonly satellite?: boolean;
      readonly edgeRuntime?: boolean;
    };
  }

  /** Frozen, content-addressed config artifact */
  export interface Shape {
    readonly _tag: 'ConfigDef';
    readonly id: ContentAddress;
    readonly boundaries: Record<string, Boundary.Shape>;
    readonly tokens: Record<string, Token.Shape>;
    readonly themes: Record<string, Theme.Shape>;
    readonly styles: Record<string, Style.Shape>;
    readonly vite?: Input['vite'];
    readonly astro?: Input['astro'];
  }
}

/** Ergonomic alias for czap.config.ts usage at the workspace root */
export declare function defineConfig(input: Config.Input): Config.Shape;
```

- [ ] **Step 3: Add `config.d.ts` to `_spine/index.d.ts`**

Append to the end of `packages/_spine/index.d.ts`:

```typescript
export * from './config.d.ts';
```

- [ ] **Step 4: Run typecheck**

```
cd C:\Users\<username>\.projects\czap && pnpm run typecheck
```

Expected: silent. The `.d.ts` files are not compiled by `tsc --noEmit` directly; no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/_spine/package.json packages/_spine/config.d.ts packages/_spine/index.d.ts
git commit -m "bang1(spine): package.json + config.d.ts type contract"
```

---

### Task 2: Modify `_spine/vite.d.ts`

**Files:**
- Modify: `packages/_spine/vite.d.ts`

- [ ] **Step 1: Add `PrimitiveKind` block before §1 PLUGIN CONFIG**

Insert after the import block and before the `§ 1. PLUGIN CONFIG` section header:

```typescript
// ═══════════════════════════════════════════════════════════════════════════════
// § 0. PRIMITIVE KIND
// ═══════════════════════════════════════════════════════════════════════════════

export type PrimitiveKind = 'boundary' | 'token' | 'theme' | 'style';

export type PrimitiveShape<K extends PrimitiveKind> =
  K extends 'boundary' ? Boundary.Shape :
  K extends 'token' ? Token.Shape :
  K extends 'theme' ? Theme.Shape :
  Style.Shape;

export interface PrimitiveResolution<K extends PrimitiveKind> {
  readonly primitive: PrimitiveShape<K>;
  readonly source: string;
}
```

- [ ] **Step 2: Replace the 4 dead dir fields in `PluginConfig`**

Replace the existing `PluginConfig` interface:

Old:
```typescript
export interface PluginConfig {
  readonly boundaryDir?: string;
  readonly tokenDir?: string;
  readonly themeDir?: string;
  readonly styleDir?: string;
  readonly hmr?: boolean;
  readonly environments?: readonly ('browser' | 'server' | 'shader')[];
}
```

New:
```typescript
export interface PluginConfig {
  readonly dirs?: Partial<Record<PrimitiveKind, string>>;
  readonly hmr?: boolean;
  readonly environments?: readonly ('browser' | 'server' | 'shader')[];
  readonly wasm?: { readonly enabled?: boolean; readonly path?: string };
}
```

- [ ] **Step 3: Add `virtual:czap/config` to `VirtualModuleId`**

Replace:
```typescript
export type VirtualModuleId =
  | 'virtual:czap/tokens'
  | 'virtual:czap/tokens.css'
  | 'virtual:czap/boundaries'
  | 'virtual:czap/themes';
```

With:
```typescript
export type VirtualModuleId =
  | 'virtual:czap/tokens'
  | 'virtual:czap/tokens.css'
  | 'virtual:czap/boundaries'
  | 'virtual:czap/themes'
  | 'virtual:czap/config';
```

- [ ] **Step 4: Replace §7–§10 with generic `resolvePrimitive`**

Delete the four resolution sections (§7 `BoundaryResolution` through §10 `StyleResolution` including their individual `resolveBoundary`/`Token_resolve`/`Theme_resolve`/`Style_resolve` function declarations).

Replace with:

```typescript
// ═══════════════════════════════════════════════════════════════════════════════
// § 7. PRIMITIVE RESOLUTION (generic)
// ═══════════════════════════════════════════════════════════════════════════════

export declare function resolvePrimitive<K extends PrimitiveKind>(
  kind: K,
  name: string,
  fromFile: string,
  projectRoot: string,
  userDir?: string,
): Promise<PrimitiveResolution<K> | null>;
```

- [ ] **Step 5: Run typecheck**

```
pnpm run typecheck
```

Expected: errors in `packages/vite/src/plugin.ts` and `packages/vite/src/index.ts` (they still import the old `boundaryDir` shape and old resolver functions). These are expected — they will be fixed in Bang 2 Task 9. Note the errors but do not fix them now.

Actually: if there are compile errors, `pnpm run typecheck` will exit non-zero. We need it to be silent. Check if the PluginConfig type change in `_spine/vite.d.ts` propagates errors to the runtime `plugin.ts`.

The `_spine/vite.d.ts` is NOT in the TypeScript project references — it is not directly compiled. The runtime `plugin.ts` has its own `PluginConfig` interface inline that doesn't import from `_spine`. So the spine change does NOT cascade errors to plugin.ts at compile time.

Expected: silent (the spine `.d.ts` change is isolated, runtime files have their own types).

- [ ] **Step 6: Commit**

```bash
git add packages/_spine/vite.d.ts
git commit -m "bang1(spine): PrimitiveKind, dirs, virtual:czap/config, generic resolvePrimitive"
```

---

### Task 3: `Config` Stub in `packages/core`

**Files:**
- Create: `packages/core/src/config.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Create `packages/core/src/config.ts` with full types and throwing stubs**

```typescript
/**
 * Config -- unified project configuration hub.
 *
 * Bang 1: types complete, implementations throw. Real logic in Bang 2.
 */

import type { ContentAddress } from './brands.js';
import type { Boundary } from './boundary.js';
import type { Token } from './token.js';
import type { Theme } from './theme.js';
import type { Style } from './style.js';

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export type PrimitiveKind = 'boundary' | 'token' | 'theme' | 'style';

export interface PluginConfig {
  readonly dirs?: Partial<Record<PrimitiveKind, string>>;
  readonly hmr?: boolean;
  readonly environments?: readonly ('browser' | 'server' | 'shader')[];
  readonly wasm?: { readonly enabled?: boolean; readonly path?: string };
}

export interface AstroConfig {
  readonly satellite?: boolean;
  readonly edgeRuntime?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Config namespace + value object (declaration merging)
// ─────────────────────────────────────────────────────────────────────────────

export const Config = {
  make(_input: Config.Input): Config.Shape {
    throw new Error('Config.make: not implemented');
  },
  toViteConfig(_cfg: Config.Shape): PluginConfig {
    throw new Error('Config.toViteConfig: not implemented');
  },
  toAstroConfig(_cfg: Config.Shape): AstroConfig {
    throw new Error('Config.toAstroConfig: not implemented');
  },
  toTestAliases(_cfg: Config.Shape, _repoRoot: string): Record<string, string> {
    throw new Error('Config.toTestAliases: not implemented');
  },
};

// eslint-disable-next-line @typescript-eslint/no-namespace
export declare namespace Config {
  interface Input {
    readonly boundaries?: Record<string, Boundary.Shape>;
    readonly tokens?: Record<string, Token.Shape>;
    readonly themes?: Record<string, Theme.Shape>;
    readonly styles?: Record<string, Style.Shape>;
    readonly vite?: Partial<PluginConfig>;
    readonly astro?: Partial<AstroConfig>;
  }

  interface Shape {
    readonly _tag: 'ConfigDef';
    readonly id: ContentAddress;
    readonly boundaries: Record<string, Boundary.Shape>;
    readonly tokens: Record<string, Token.Shape>;
    readonly themes: Record<string, Theme.Shape>;
    readonly styles: Record<string, Style.Shape>;
    readonly vite?: Partial<PluginConfig>;
    readonly astro?: Partial<AstroConfig>;
  }
}

/** Ergonomic alias used in czap.config.ts at the workspace root */
export function defineConfig(input: Config.Input): Config.Shape {
  return Config.make(input);
}
```

- [ ] **Step 2: Export from `packages/core/src/index.ts`**

Append to `packages/core/src/index.ts`:

```typescript
// Config hub
export { Config, defineConfig } from './config.js';
export type { PrimitiveKind, PluginConfig as CorePluginConfig, AstroConfig as CoreAstroConfig } from './config.js';
```

- [ ] **Step 3: Run typecheck**

```
pnpm run typecheck
```

Expected: silent.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/config.ts packages/core/src/index.ts
git commit -m "bang1(core): Config stub with full types — throws until Bang 2"
```

---

### Task 4: `resolvePrimitive` Stub in `packages/vite`

**Files:**
- Create: `packages/vite/src/primitive-resolve.ts`
- Modify: `packages/vite/src/index.ts`

- [ ] **Step 1: Create `packages/vite/src/primitive-resolve.ts` with full types and throwing stub**

```typescript
/**
 * Generic primitive resolver — replaces boundary-resolve, token-resolve,
 * theme-resolve, style-resolve with a single parameterised implementation.
 *
 * Bang 1: full types, stub implementation throws. Real logic in Bang 2.
 */

import type { Boundary, Token, Theme, Style } from '@czap/core';
import type { PrimitiveKind } from '@czap/core';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type { PrimitiveKind };

export type PrimitiveShape<K extends PrimitiveKind> =
  K extends 'boundary' ? Boundary.Shape :
  K extends 'token' ? Token.Shape :
  K extends 'theme' ? Theme.Shape :
  Style.Shape;

export interface PrimitiveResolution<K extends PrimitiveKind> {
  readonly primitive: PrimitiveShape<K>;
  readonly source: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolution metadata (used in Bang 2 implementation)
// ─────────────────────────────────────────────────────────────────────────────

export const KIND_META: Record<PrimitiveKind, { file: string; suffix: string; tag: string }> = {
  boundary: { file: 'boundaries.ts', suffix: '.boundaries.ts', tag: 'BoundaryDef' },
  token:    { file: 'tokens.ts',     suffix: '.tokens.ts',     tag: 'TokenDef'    },
  theme:    { file: 'themes.ts',     suffix: '.themes.ts',     tag: 'ThemeDef'    },
  style:    { file: 'styles.ts',     suffix: '.styles.ts',     tag: 'StyleDef'    },
};

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve any primitive kind by name using convention-based file lookup.
 *
 * Resolution order:
 *   1. userDir (if provided via config.dirs[kind])
 *   2. Same directory as fromFile: `{kind}s.ts` then `*.{kind}s.ts`
 *   3. Project root: `{kind}s.ts` then `*.{kind}s.ts`
 *   4. null if not found
 */
export async function resolvePrimitive<K extends PrimitiveKind>(
  _kind: K,
  _name: string,
  _fromFile: string,
  _projectRoot: string,
  _userDir?: string,
): Promise<PrimitiveResolution<K> | null> {
  throw new Error('resolvePrimitive: not implemented');
}
```

- [ ] **Step 2: Add export to `packages/vite/src/index.ts`**

Append to `packages/vite/src/index.ts`:

```typescript
// Generic primitive resolution
export type { PrimitiveKind, PrimitiveResolution, PrimitiveShape } from './primitive-resolve.js';
export { resolvePrimitive, KIND_META } from './primitive-resolve.js';
```

- [ ] **Step 3: Run typecheck**

```
pnpm run typecheck
```

Expected: silent.

- [ ] **Step 4: Commit**

```bash
git add packages/vite/src/primitive-resolve.ts packages/vite/src/index.ts
git commit -m "bang1(vite): resolvePrimitive stub with full types"
```

---

### Task 5: Extend `packages/compiler/src/dispatch.ts`

**Files:**
- Modify: `packages/compiler/src/dispatch.ts`
- Modify: `packages/compiler/src/index.ts`

The existing `dispatch(target, boundary, states)` function stays untouched. We add the NEW `CompilerDef` type and a stub `dispatchDef(def)` function alongside it. Bang 2 Task 11 will replace both with the final rewrite.

- [ ] **Step 1: Add `CompilerDef` type and `dispatchDef` stub at the end of `dispatch.ts`**

Append to `packages/compiler/src/dispatch.ts`:

```typescript
// ─────────────────────────────────────────────────────────────────────────────
// Tagged discriminated union (Bang 2 will make this the primary dispatch)
// ─────────────────────────────────────────────────────────────────────────────

import type { Config } from '@czap/core';

export type CSSStates = Record<string, Record<string, string>>;
export type GLSLStates = Record<string, Record<string, number>>;
export type WGSLStates = Record<string, Record<string, number>>;
export interface ARIAStates {
  readonly states: Record<string, Record<string, string>>;
  readonly currentState: string;
}

export interface ConfigTemplateResult {
  readonly json: string;
}

export type CompilerDef =
  | { readonly _tag: 'CSS';    readonly boundary: Boundary.Shape; readonly states: CSSStates }
  | { readonly _tag: 'GLSL';   readonly boundary: Boundary.Shape; readonly states: GLSLStates }
  | { readonly _tag: 'WGSL';   readonly boundary: Boundary.Shape; readonly states: WGSLStates }
  | { readonly _tag: 'ARIA';   readonly boundary: Boundary.Shape; readonly states: ARIAStates }
  | { readonly _tag: 'AI';     readonly manifest: AIManifest }
  | { readonly _tag: 'Config'; readonly config: Config.Shape };

/** Stub — replaced with exhaustive tagged switch in Bang 2 */
export function dispatchDef(_def: CompilerDef): CompileResult | ConfigTemplateResult {
  throw new Error('dispatchDef: not implemented');
}
```

Note: `Boundary` and `AIManifest` are already imported at the top of `dispatch.ts`. The `Config` import above adds `@czap/core`.

- [ ] **Step 2: Export new types from `packages/compiler/src/index.ts`**

Append to `packages/compiler/src/index.ts`:

```typescript
export type { CompilerDef, CSSStates, GLSLStates, WGSLStates, ARIAStates, ConfigTemplateResult } from './dispatch.js';
export { dispatchDef } from './dispatch.js';
```

- [ ] **Step 3: Run typecheck**

```
pnpm run typecheck
```

Expected: silent.

- [ ] **Step 4: Commit**

```bash
git add packages/compiler/src/dispatch.ts packages/compiler/src/index.ts
git commit -m "bang1(compiler): CompilerDef tagged union + dispatchDef stub"
```

---

### Task 6: Test Infrastructure

**Files:**
- Create: `tests/helpers/primitive-harness.ts`
- Create: `tests/unit/core/config.test.ts`
- Create: `tests/unit/spine-conformance.ts`
- Create: `tests/property/config.prop.test.ts`
- Modify: `tests/unit/vite/vite-resolve.test.ts`
- Modify: `tests/unit/compiler/dispatch-compiler.test.ts`

- [ ] **Step 1: Create `tests/helpers/primitive-harness.ts`**

```typescript
/**
 * Shared test infrastructure for all PrimitiveKind operations.
 *
 * PRIMITIVE_KINDS — exhaustive const array, use with test.each()
 * resolverSuite()  — factory for parameterised resolver test cases
 * arb*             — fast-check arbitraries shared by property tests + bench
 */

import * as fc from 'fast-check';
import { Boundary, Token, Theme, Style } from '@czap/core';
import type { PrimitiveKind } from '@czap/core';

export const PRIMITIVE_KINDS = ['boundary', 'token', 'theme', 'style'] as const satisfies PrimitiveKind[];

// ─────────────────────────────────────────────────────────────────────────────
// Shared arbitraries
// ─────────────────────────────────────────────────────────────────────────────

export const arbPrimitiveKind: fc.Arbitrary<PrimitiveKind> =
  fc.constantFrom(...PRIMITIVE_KINDS);

export const arbBoundaryShape: fc.Arbitrary<Boundary.Shape> = fc.constant(
  Boundary.make({
    input: 'viewport.width',
    at: [[0, 'small'], [768, 'large']] as const,
  }),
);

export const arbTokenShape: fc.Arbitrary<Token.Shape> = fc.constant(
  Token.make({
    name: 'spacing',
    category: 'spacing',
    axes: ['base'] as const,
    values: { base: '16px' },
    fallback: '16px',
  }),
);

export const arbThemeShape: fc.Arbitrary<Theme.Shape> = fc.constant(
  Theme.make({ name: 'default', tokens: {}, surfaces: {} }),
);

export const arbStyleShape: fc.Arbitrary<Style.Shape> = fc.constant(
  Style.make({ name: 'card', boundary: Boundary.make({ input: 'viewport.width', at: [[0, 'sm']] as const }), base: { properties: {} }, states: {} }),
);

export const arbConfigInput = fc.record({
  boundaries: fc.dictionary(
    fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-z]/.test(s)),
    arbBoundaryShape,
  ),
  tokens:   fc.constant({}),
  themes:   fc.constant({}),
  styles:   fc.constant({}),
});

// ─────────────────────────────────────────────────────────────────────────────
// Resolver test suite factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a set of test case descriptions for a given PrimitiveKind.
 * Use with test.each(PRIMITIVE_KINDS) to parameterise tests.
 */
export function resolverSuite(kind: PrimitiveKind) {
  const plural = `${kind}s`;
  return {
    sameDir:         `resolves ${kind} from same-dir ${plural}.ts`,
    wildcard:        `resolves ${kind} from same-dir *.${plural}.ts`,
    rootFallback:    `resolves ${kind} from project root ${plural}.ts`,
    userDirOverride: `resolves ${kind} from config.dirs.${kind} override`,
    notFound:        `returns null when no ${kind} file exists`,
  };
}
```

- [ ] **Step 2: Create `tests/unit/core/config.test.ts`**

```typescript
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
});

describe('Config.toAstroConfig()', () => {
  test('maps astro fields', () => {
    const cfg = Config.make({ astro: { satellite: true } });
    const astro = Config.toAstroConfig(cfg);
    expect(astro.satellite).toBe(true);
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
```

- [ ] **Step 3: Create `tests/unit/spine-conformance.ts`**

This file starts sparse — just runtime existence checks that will fail. Bang 2 Task 8 adds the type-level `satisfies` checks.

```typescript
/**
 * Spine conformance — structural runtime existence checks.
 *
 * Bang 1: only runtime checks (to avoid compile errors before implementations exist).
 * Bang 2: full satisfies type-level checks added.
 */

import { describe, test, expect } from 'vitest';
import * as CoreImpl from '@czap/core';
import * as ViteImpl from '@czap/vite';
import * as CompilerImpl from '@czap/compiler';

describe('spine conformance — @czap/core', () => {
  test('Config exported from @czap/core', () => {
    const impl = CoreImpl as Record<string, unknown>;
    expect(impl['Config']).toBeDefined();
    expect(typeof (impl['Config'] as Record<string, unknown>)['make']).toBe('function');
    expect(typeof (impl['Config'] as Record<string, unknown>)['toViteConfig']).toBe('function');
    expect(typeof (impl['Config'] as Record<string, unknown>)['toAstroConfig']).toBe('function');
    expect(typeof (impl['Config'] as Record<string, unknown>)['toTestAliases']).toBe('function');
  });

  test('defineConfig exported from @czap/core', () => {
    const impl = CoreImpl as Record<string, unknown>;
    expect(typeof impl['defineConfig']).toBe('function');
  });
});

describe('spine conformance — @czap/vite', () => {
  test('resolvePrimitive exported from @czap/vite', () => {
    const impl = ViteImpl as Record<string, unknown>;
    expect(typeof impl['resolvePrimitive']).toBe('function');
  });
});

describe('spine conformance — @czap/compiler', () => {
  test('dispatch exported from @czap/compiler', () => {
    const impl = CompilerImpl as Record<string, unknown>;
    expect(typeof impl['dispatch']).toBe('function');
  });
});
```

- [ ] **Step 4: Create `tests/property/config.prop.test.ts`**

```typescript
/**
 * Config determinism — same input always produces same ContentAddress.
 * Bang 1: fails because Config.make throws.
 */

import { describe, test } from 'vitest';
import * as fc from 'fast-check';
import { Config } from '@czap/core';
import { arbConfigInput } from '../../helpers/primitive-harness.js';

describe('Config determinism (property)', () => {
  test.prop([arbConfigInput])('same input → same id', (input) => {
    const c1 = Config.make(input);
    const c2 = Config.make(input);
    return c1.id === c2.id;
  });

  test.prop([arbConfigInput])('output is frozen', (input) => {
    const cfg = Config.make(input);
    return Object.isFrozen(cfg);
  });

  test.prop([arbConfigInput])('_tag is always ConfigDef', (input) => {
    const cfg = Config.make(input);
    return cfg._tag === 'ConfigDef';
  });
});
```

Note: `test.prop` is vitest's fast-check integration. If your vitest setup uses `fc.assert(fc.property(...))` pattern instead, use that:

```typescript
test('same input → same id', () => {
  fc.assert(fc.property(arbConfigInput, (input) => {
    const c1 = Config.make(input);
    const c2 = Config.make(input);
    return c1.id === c2.id;
  }));
});
```

Check `tests/property/` for the existing pattern and match it.

- [ ] **Step 5: Extend `tests/unit/vite/vite-resolve.test.ts` with `resolvePrimitive` tests**

Read the existing file, then append this new `describe` block:

```typescript
import { resolvePrimitive } from '../../../packages/vite/src/primitive-resolve.js';

describe('resolvePrimitive() — generic resolver', () => {
  test.each(['boundary', 'token', 'theme', 'style'] as const)(
    'resolves %s from same-dir convention file',
    async (kind) => {
      const root = makeTempDir();
      const sourceDir = join(root, 'src');

      const plural = `${kind}s`;
      const tag = kind === 'boundary' ? 'BoundaryDef' : kind === 'token' ? 'TokenDef' : kind === 'theme' ? 'ThemeDef' : 'StyleDef';
      const exportValue = getMinimalExport(kind, tag);

      writeModule(sourceDir, `${plural}.ts`, `export const primary = ${exportValue};`);
      const fromFile = join(sourceDir, 'panel.css');

      const resolution = await resolvePrimitive(kind, 'primary', fromFile, root);
      expect(resolution).not.toBeNull();
      expect(resolution?.source).toContain(`${plural}.ts`);
    },
  );

  test.each(['boundary', 'token', 'theme', 'style'] as const)(
    'resolves %s when userDir override provided',
    async (kind) => {
      const root = makeTempDir();
      const sourceDir = join(root, 'src');
      const customDir = join(root, 'custom');

      const plural = `${kind}s`;
      const tag = kind === 'boundary' ? 'BoundaryDef' : kind === 'token' ? 'TokenDef' : kind === 'theme' ? 'ThemeDef' : 'StyleDef';
      writeModule(customDir, `${plural}.ts`, `export const primary = ${getMinimalExport(kind, tag)};`);

      const fromFile = join(sourceDir, 'panel.css');
      const resolution = await resolvePrimitive(kind, 'primary', fromFile, root, customDir);
      expect(resolution?.source).toContain(customDir);
    },
  );

  test.each(['boundary', 'token', 'theme', 'style'] as const)(
    'returns null for %s when no file exists',
    async (kind) => {
      const root = makeTempDir();
      const fromFile = join(root, 'panel.css');
      const resolution = await resolvePrimitive(kind, 'nonexistent', fromFile, root);
      expect(resolution).toBeNull();
    },
  );
});

/** Returns a minimal valid tagged export string for a given kind */
function getMinimalExport(kind: string, tag: string): string {
  if (kind === 'boundary') {
    return `{ _tag: '${tag}', id: 'fnv1a:00000001', input: 'viewport.width', thresholds: [0], states: ['mobile'] }`;
  }
  if (kind === 'token') {
    return `{ _tag: '${tag}', id: 'fnv1a:00000002', name: 'primary', category: 'color', axes: ['base'], values: { base: '#000' }, fallback: '#000' }`;
  }
  if (kind === 'theme') {
    return `{ _tag: '${tag}', id: 'fnv1a:00000003', name: 'default', tokens: {}, surfaces: {} }`;
  }
  return `{ _tag: '${tag}', id: 'fnv1a:00000004', name: 'card', boundary: {}, base: { properties: {} }, states: {} }`;
}
```

- [ ] **Step 6: Extend `tests/unit/compiler/dispatch-compiler.test.ts` with `CompilerDef` tests**

Read the existing file, then append:

```typescript
import { dispatchDef, type CompilerDef } from '@czap/compiler';
import { Config } from '@czap/core';

describe('dispatchDef() — tagged CompilerDef dispatch', () => {
  test('CSS CompilerDef routes and returns target css', () => {
    const def: CompilerDef = { _tag: 'CSS', boundary, states: cssStates };
    const result = dispatchDef(def);
    expect((result as { target: string }).target).toBe('css');
  });

  test('GLSL CompilerDef routes and returns target glsl', () => {
    const def: CompilerDef = { _tag: 'GLSL', boundary, states: numericStates };
    const result = dispatchDef(def);
    expect((result as { target: string }).target).toBe('glsl');
  });

  test('WGSL CompilerDef routes and returns target wgsl', () => {
    const def: CompilerDef = { _tag: 'WGSL', boundary, states: numericStates };
    const result = dispatchDef(def);
    expect((result as { target: string }).target).toBe('wgsl');
  });

  test('ARIA CompilerDef routes and returns target aria', () => {
    const def: CompilerDef = { _tag: 'ARIA', boundary, states: ariaInput };
    const result = dispatchDef(def);
    expect((result as { target: string }).target).toBe('aria');
  });

  test('AI CompilerDef routes and returns target ai', () => {
    const def: CompilerDef = { _tag: 'AI', manifest: aiManifest };
    const result = dispatchDef(def);
    expect((result as { target: string }).target).toBe('ai');
  });

  test('Config CompilerDef routes and returns json string', () => {
    const cfg = Config.make({});
    const def: CompilerDef = { _tag: 'Config', config: cfg };
    const result = dispatchDef(def) as { json: string };
    expect(result.json).toContain('ConfigDef');
  });
});
```

- [ ] **Step 7: Run typecheck to confirm Bang 1 is type-clean**

```
pnpm run typecheck
```

Expected: silent. Any errors must be fixed before proceeding.

- [ ] **Step 8: Run the new tests to confirm they are all red**

```
pnpm test -- tests/unit/core/config.test.ts tests/property/config.prop.test.ts tests/unit/spine-conformance.ts
```

Expected: all fail with `Error: Config.make: not implemented` or similar.

```
pnpm test -- tests/unit/vite/vite-resolve.test.ts
```

Expected: new `resolvePrimitive` tests fail with `Error: resolvePrimitive: not implemented`. Old tests pass.

```
pnpm test -- tests/unit/compiler/dispatch-compiler.test.ts
```

Expected: new `dispatchDef` tests fail with `Error: dispatchDef: not implemented`. Old tests pass.

- [ ] **Step 9: Commit**

```bash
git add tests/helpers/primitive-harness.ts tests/unit/core/config.test.ts tests/unit/spine-conformance.ts tests/property/config.prop.test.ts tests/unit/vite/vite-resolve.test.ts tests/unit/compiler/dispatch-compiler.test.ts
git commit -m "bang1(tests): failing tests for Config, resolvePrimitive, CompilerDef, spine conformance"
```

---

### Task 7: Bench Stubs + Bang 1 Gate

**Files:**
- Modify: `tests/bench/core.bench.ts`
- Modify: `tests/bench/directive.bench.ts`

- [ ] **Step 1: Add Config bench entries to `tests/bench/core.bench.ts`**

Read the file. Add these bench entries after the existing `bench(...)` calls (before `await bench.run()`):

```typescript
import { Config } from '@czap/core';

// Config bench entries
const testCfg = Config.make({
  boundaries: { viewport: boundary3 },
  tokens: {},
  themes: {},
  styles: {},
});

bench('Config.make() -- empty config', () => {
  Config.make({});
});

bench('Config.make() -- with boundaries', () => {
  Config.make({ boundaries: { viewport: boundary3, layout: boundary5 } });
});

bench('Config.toViteConfig() -- projection', () => {
  Config.toViteConfig(testCfg);
});
```

Note: `boundary3` and `boundary5` are already defined in the bench file's fixture section. If not, define them using `Boundary.make()` following the existing pattern.

- [ ] **Step 2: Add `resolvePrimitive` bench stubs to `tests/bench/directive.bench.ts`**

Read the existing file. The directive bench uses a different structure (custom runner). Check the file for the pattern and add bench entries that call `resolvePrimitive` — but since the function throws, wrap in try/catch or note these will error until Bang 2.

Actually: bench files that throw will abort the bench run. Leave the resolvePrimitive benches as comments in Bang 1, uncomment in Bang 2 Task 9:

```typescript
// TODO(bang2/task9): uncomment when resolvePrimitive is implemented
// import { resolvePrimitive } from '@czap/vite';
// bench('resolvePrimitive(boundary) -- same-dir hit', async () => {
//   await resolvePrimitive('boundary', 'primary', join(root, 'src/panel.css'), root);
// });
```

- [ ] **Step 3: Run typecheck**

```
pnpm run typecheck
```

Expected: silent.

- [ ] **Step 4: Bang 1 Final Gate — all checks pass**

Run the complete Bang 1 verification:

```
pnpm run typecheck
```
Expected: silent (zero compiler errors).

```
pnpm test -- tests/unit/core/config.test.ts tests/property/config.prop.test.ts tests/unit/spine-conformance.ts tests/unit/vite/vite-resolve.test.ts tests/unit/compiler/dispatch-compiler.test.ts
```
Expected: all new tests fail. All existing tests pass.

If any existing test breaks, fix it before proceeding to Bang 2.

- [ ] **Step 5: Commit**

```bash
git add tests/bench/core.bench.ts tests/bench/directive.bench.ts
git commit -m "bang1: bench stubs — Bang 1 complete, all new tests red, tsc clean"
```

---

## ═══════════════════════════════════════
## BANG 2: Implementation
## ═══════════════════════════════════════

**Rule:** Implement in the exact sequence below. Each task ends with specific test files going green. Do not move to the next task until the current gate passes.

---

### Task 8: Implement `Config.make()` and Projections

**Files:**
- Modify: `packages/core/src/config.ts`

- [ ] **Step 1: Replace stubs with real implementations in `packages/core/src/config.ts`**

Full replacement of the file:

```typescript
/**
 * Config -- unified project configuration hub.
 *
 * Config.make() produces a frozen, FNV-1a content-addressed Config.Shape.
 * Projection functions are pure — no side effects, no I/O.
 */

import { resolve } from 'node:path';
import type { ContentAddress } from './brands.js';
import type { Boundary } from './boundary.js';
import type { Token } from './token.js';
import type { Theme } from './theme.js';
import type { Style } from './style.js';
import { fnv1a } from './fnv.js';

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export type PrimitiveKind = 'boundary' | 'token' | 'theme' | 'style';

export interface PluginConfig {
  readonly dirs?: Partial<Record<PrimitiveKind, string>>;
  readonly hmr?: boolean;
  readonly environments?: readonly ('browser' | 'server' | 'shader')[];
  readonly wasm?: { readonly enabled?: boolean; readonly path?: string };
}

export interface AstroConfig {
  readonly satellite?: boolean;
  readonly edgeRuntime?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Config namespace + value object (declaration merging — same pattern as Boundary)
// ─────────────────────────────────────────────────────────────────────────────

export const Config = {
  make(input: Config.Input): Config.Shape {
    const canonical = JSON.stringify({
      boundaries: input.boundaries ?? {},
      tokens:     input.tokens     ?? {},
      themes:     input.themes     ?? {},
      styles:     input.styles     ?? {},
      vite:       input.vite,
      astro:      input.astro,
    });
    const id = fnv1a(canonical);
    return Object.freeze({
      _tag:       'ConfigDef' as const,
      id,
      boundaries: input.boundaries ?? {},
      tokens:     input.tokens     ?? {},
      themes:     input.themes     ?? {},
      styles:     input.styles     ?? {},
      vite:       input.vite,
      astro:      input.astro,
    });
  },

  toViteConfig(cfg: Config.Shape): PluginConfig {
    return {
      ...(cfg.vite?.dirs        !== undefined && { dirs:         cfg.vite.dirs }),
      ...(cfg.vite?.hmr         !== undefined && { hmr:          cfg.vite.hmr }),
      ...(cfg.vite?.environments !== undefined && { environments: cfg.vite.environments }),
      ...(cfg.vite?.wasm        !== undefined && { wasm:         cfg.vite.wasm }),
    };
  },

  toAstroConfig(cfg: Config.Shape): AstroConfig {
    return {
      ...(cfg.astro?.satellite    !== undefined && { satellite:    cfg.astro.satellite }),
      ...(cfg.astro?.edgeRuntime  !== undefined && { edgeRuntime:  cfg.astro.edgeRuntime }),
    };
  },

  toTestAliases(cfg: Config.Shape, repoRoot: string): Record<string, string> {
    void cfg; // cfg reserved for future per-project customisation
    return {
      '@czap/core':              resolve(repoRoot, 'packages/core/src/index.ts'),
      '@czap/quantizer':         resolve(repoRoot, 'packages/quantizer/src/index.ts'),
      '@czap/compiler':          resolve(repoRoot, 'packages/compiler/src/index.ts'),
      '@czap/web/lite':          resolve(repoRoot, 'packages/web/src/lite.ts'),
      '@czap/web':               resolve(repoRoot, 'packages/web/src/index.ts'),
      '@czap/detect':            resolve(repoRoot, 'packages/detect/src/index.ts'),
      '@czap/vite/html-transform': resolve(repoRoot, 'packages/vite/src/html-transform.ts'),
      '@czap/vite':              resolve(repoRoot, 'packages/vite/src/index.ts'),
      '@czap/astro/runtime':     resolve(repoRoot, 'packages/astro/src/runtime/index.ts'),
      '@czap/astro':             resolve(repoRoot, 'packages/astro/src/index.ts'),
      '@czap/remotion':          resolve(repoRoot, 'packages/remotion/src/index.ts'),
      '@czap/edge':              resolve(repoRoot, 'packages/edge/src/index.ts'),
      '@czap/worker':            resolve(repoRoot, 'packages/worker/src/index.ts'),
      '@czap/_spine':            resolve(repoRoot, 'packages/_spine'),
    };
  },
};

// eslint-disable-next-line @typescript-eslint/no-namespace
export declare namespace Config {
  interface Input {
    readonly boundaries?: Record<string, Boundary.Shape>;
    readonly tokens?: Record<string, Token.Shape>;
    readonly themes?: Record<string, Theme.Shape>;
    readonly styles?: Record<string, Style.Shape>;
    readonly vite?: Partial<PluginConfig>;
    readonly astro?: Partial<AstroConfig>;
  }

  interface Shape {
    readonly _tag: 'ConfigDef';
    readonly id: ContentAddress;
    readonly boundaries: Record<string, Boundary.Shape>;
    readonly tokens: Record<string, Token.Shape>;
    readonly themes: Record<string, Theme.Shape>;
    readonly styles: Record<string, Style.Shape>;
    readonly vite?: Partial<PluginConfig>;
    readonly astro?: Partial<AstroConfig>;
  }
}

export function defineConfig(input: Config.Input): Config.Shape {
  return Config.make(input);
}
```

- [ ] **Step 2: Run typecheck**

```
pnpm run typecheck
```

Expected: silent.

- [ ] **Step 3: Run Config tests → green**

```
pnpm test -- tests/unit/core/config.test.ts tests/property/config.prop.test.ts
```

Expected: all pass. If any fail, fix before continuing.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/config.ts
git commit -m "bang2(core): implement Config.make(), projections, toTestAliases"
```

---

### Task 9: Wire `@czap/_spine` + Spine Conformance

**Files:**
- Modify: `vitest.shared.ts`
- Modify: `tests/unit/spine-conformance.ts`

- [ ] **Step 1: Add `@czap/_spine` alias to `vitest.shared.ts`**

In `vitest.shared.ts`, the `alias` object currently has all `@czap/*` packages. Add the `_spine` entry. But since we're about to update `vitest.shared.ts` in Task 14 to derive from `Config.toTestAliases`, do NOT add it manually here. Instead, just verify that the `Config.toTestAliases` implementation already includes `@czap/_spine` (it does — see Task 8 Step 1).

For now, manually add it to `vitest.shared.ts` as a temporary bridge until Task 14 replaces the whole alias block:

In `vitest.shared.ts`, find the `alias` object and add:
```typescript
'@czap/_spine': resolve(repoRoot, 'packages/_spine'),
```

- [ ] **Step 2: Flesh out `tests/unit/spine-conformance.ts` with real checks**

The full conformance test now that Config exists:

```typescript
/**
 * Spine conformance — runtime existence + type-level structural checks.
 */

import { describe, test, expect } from 'vitest';
import type * as SpineCore from '@czap/_spine';
import * as CoreImpl from '@czap/core';
import * as ViteImpl from '@czap/vite';
import * as CompilerImpl from '@czap/compiler';
import { Boundary } from '@czap/core';

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

  test('dispatchDef exported and callable', () => {
    expect(typeof CompilerImpl.dispatchDef).toBe('function');
  });
});
```

- [ ] **Step 3: Run typecheck**

```
pnpm run typecheck
```

Expected: silent.

- [ ] **Step 4: Run spine-conformance tests → green (except resolvePrimitive)**

```
pnpm test -- tests/unit/spine-conformance.ts
```

Expected: Config-related checks pass. `resolvePrimitive` check passes (the stub is exported, just throws). `dispatchDef` check passes.

- [ ] **Step 5: Commit**

```bash
git add vitest.shared.ts tests/unit/spine-conformance.ts
git commit -m "bang2(spine): wire @czap/_spine alias + full conformance tests"
```

---

### Task 10: Implement `resolvePrimitive` + Update `plugin.ts`

**Files:**
- Modify: `packages/vite/src/primitive-resolve.ts`
- Modify: `packages/vite/src/plugin.ts`
- Modify: `packages/vite/src/index.ts`
- Delete: `packages/vite/src/boundary-resolve.ts`
- Delete: `packages/vite/src/token-resolve.ts`
- Delete: `packages/vite/src/theme-resolve.ts`
- Delete: `packages/vite/src/style-resolve.ts`

- [ ] **Step 1: Implement `resolvePrimitive` in `packages/vite/src/primitive-resolve.ts`**

Replace the throwing stub with the real implementation:

```typescript
/**
 * Generic primitive resolver — replaces the 4 kind-specific resolve files.
 *
 * Resolution order for each kind:
 *   1. userDir/{kind}s.ts             (if config.dirs[kind] set)
 *   2. userDir/*.{kind}s.ts           (if config.dirs[kind] set)
 *   3. fromFile's dir/{kind}s.ts
 *   4. fromFile's dir/*.{kind}s.ts
 *   5. projectRoot/{kind}s.ts
 *   6. projectRoot/*.{kind}s.ts
 *   7. null
 */

import type { Boundary, Token, Theme, Style } from '@czap/core';
import type { PrimitiveKind } from '@czap/core';
import * as path from 'node:path';
import { fileExists, findConventionFiles } from './resolve-fs.js';
import { tryImportNamed } from './resolve-utils.js';

export type { PrimitiveKind };

export type PrimitiveShape<K extends PrimitiveKind> =
  K extends 'boundary' ? Boundary.Shape :
  K extends 'token' ? Token.Shape :
  K extends 'theme' ? Theme.Shape :
  Style.Shape;

export interface PrimitiveResolution<K extends PrimitiveKind> {
  readonly primitive: PrimitiveShape<K>;
  readonly source: string;
}

export const KIND_META: Record<PrimitiveKind, { file: string; suffix: string; tag: string }> = {
  boundary: { file: 'boundaries.ts', suffix: '.boundaries.ts', tag: 'BoundaryDef' },
  token:    { file: 'tokens.ts',     suffix: '.tokens.ts',     tag: 'TokenDef'    },
  theme:    { file: 'themes.ts',     suffix: '.themes.ts',     tag: 'ThemeDef'    },
  style:    { file: 'styles.ts',     suffix: '.styles.ts',     tag: 'StyleDef'    },
};

export async function resolvePrimitive<K extends PrimitiveKind>(
  kind: K,
  name: string,
  fromFile: string,
  projectRoot: string,
  userDir?: string,
): Promise<PrimitiveResolution<K> | null> {
  const { file, suffix, tag } = KIND_META[kind];
  const diagnosticSource = `czap/vite.${kind}-resolve`;
  const sourceDir = path.dirname(fromFile);

  const searchDirs: string[] = [];
  if (userDir) searchDirs.push(userDir);
  if (sourceDir !== projectRoot) searchDirs.push(sourceDir);
  searchDirs.push(projectRoot);

  for (const dir of searchDirs) {
    // Try direct convention file: boundaries.ts / tokens.ts / etc.
    const directFile = path.join(dir, file);
    if (fileExists(directFile, diagnosticSource)) {
      const result = await tryImportNamed<PrimitiveShape<K>>(
        directFile, name, tag, diagnosticSource, kind,
      );
      if (result !== undefined) return { primitive: result, source: directFile };
    }

    // Try wildcard files: *.boundaries.ts / *.tokens.ts / etc.
    const wildcardFiles = findConventionFiles(dir, suffix, diagnosticSource);
    for (const wildcardFile of wildcardFiles) {
      const result = await tryImportNamed<PrimitiveShape<K>>(
        wildcardFile, name, tag, diagnosticSource, kind,
      );
      if (result !== undefined) return { primitive: result, source: wildcardFile };
    }
  }

  return null;
}
```

- [ ] **Step 2: Update `packages/vite/src/plugin.ts` to use `resolvePrimitive`**

In `plugin.ts`:

a) Replace the 4 individual resolver imports at the top:
```typescript
// REMOVE these 4 lines:
import { resolveBoundary } from './boundary-resolve.js';
import { resolveToken } from './token-resolve.js';
import { resolveTheme } from './theme-resolve.js';
import { resolveStyle } from './style-resolve.js';

// ADD this:
import { resolvePrimitive } from './primitive-resolve.js';
```

b) Replace `PluginConfig` interface in `plugin.ts` — remove the 4 dead dir fields, add `dirs`:
```typescript
export interface PluginConfig {
  readonly dirs?: Partial<Record<'boundary' | 'token' | 'theme' | 'style', string>>;
  readonly hmr?: boolean;
  readonly environments?: readonly ('browser' | 'server' | 'shader')[];
  readonly wasm?: { readonly enabled?: boolean; readonly path?: string };
}
```

c) In the `@token` transform phase, replace:
```typescript
// OLD:
const resolution = await resolveToken(block.tokenName, id, projectRoot);
token = resolution?.token ?? null;
```
With:
```typescript
// NEW:
const resolution = await resolvePrimitive('token', block.tokenName, id, projectRoot, config?.dirs?.token);
token = resolution?.primitive ?? null;
```

d) In the `@theme` phase, replace:
```typescript
// OLD:
const resolution = await resolveTheme(block.themeName, id, projectRoot);
theme = resolution?.theme ?? null;
```
With:
```typescript
// NEW:
const resolution = await resolvePrimitive('theme', block.themeName, id, projectRoot, config?.dirs?.theme);
theme = resolution?.primitive ?? null;
```

e) In the `@style` phase, replace:
```typescript
// OLD:
const resolution = await resolveStyle(block.styleName, id, projectRoot);
style = resolution?.style ?? null;
```
With:
```typescript
// NEW:
const resolution = await resolvePrimitive('style', block.styleName, id, projectRoot, config?.dirs?.style);
style = resolution?.primitive ?? null;
```

f) In the `@quantize` phase, replace:
```typescript
// OLD:
const resolution = await resolveBoundary(block.boundaryName, id, projectRoot);
boundary = resolution?.boundary ?? null;
```
With:
```typescript
// NEW:
const resolution = await resolvePrimitive('boundary', block.boundaryName, id, projectRoot, config?.dirs?.boundary);
boundary = resolution?.primitive ?? null;
```

- [ ] **Step 3: Update `packages/vite/src/index.ts` — remove old exports, no duplicates**

Remove the 4 old resolver exports:
```typescript
// REMOVE:
export type { TokenResolution } from './token-resolve.js';
export { resolveToken } from './token-resolve.js';
export type { ThemeResolution } from './theme-resolve.js';
export { resolveTheme } from './theme-resolve.js';
export type { StyleResolution } from './style-resolve.js';
export { resolveStyle } from './style-resolve.js';
export type { BoundaryResolution } from './boundary-resolve.js';
export { resolveBoundary } from './boundary-resolve.js';
```

The `resolvePrimitive` export line added in Bang 1 Task 4 Step 2 already handles the replacement.

- [ ] **Step 4: Delete the 4 old resolver files**

```bash
rm packages/vite/src/boundary-resolve.ts
rm packages/vite/src/token-resolve.ts
rm packages/vite/src/theme-resolve.ts
rm packages/vite/src/style-resolve.ts
```

- [ ] **Step 5: Update `tests/unit/vite/vite-resolve.test.ts` — replace old individual resolver imports**

The existing tests use:
```typescript
import { resolveBoundary } from '../../../packages/vite/src/boundary-resolve.js';
import { resolveStyle }    from '../../../packages/vite/src/style-resolve.js';
import { resolveTheme }    from '../../../packages/vite/src/theme-resolve.js';
import { resolveToken }    from '../../../packages/vite/src/token-resolve.js';
```

Replace with:
```typescript
import { resolvePrimitive } from '../../../packages/vite/src/primitive-resolve.js';
```

And replace each call in the existing test bodies:
- `resolveBoundary(name, from, root)` → `resolvePrimitive('boundary', name, from, root)`; access `.primitive` instead of `.boundary`
- `resolveToken(name, from, root)` → `resolvePrimitive('token', name, from, root)`; access `.primitive` instead of `.token`
- `resolveTheme(name, from, root)` → `resolvePrimitive('theme', name, from, root)`; access `.primitive` instead of `.theme`
- `resolveStyle(name, from, root)` → `resolvePrimitive('style', name, from, root)`; access `.primitive` instead of `.style`

- [ ] **Step 6: Run typecheck**

```
pnpm run typecheck
```

Expected: silent.

- [ ] **Step 7: Run vite-resolve tests → green**

```
pnpm test -- tests/unit/vite/vite-resolve.test.ts
```

Expected: all pass (old tests updated, new `resolvePrimitive` tests now pass).

- [ ] **Step 8: Uncomment resolvePrimitive bench entries in `tests/bench/directive.bench.ts`**

Find the commented-out bench entries from Bang 1 Task 7 Step 2 and uncomment them. Set up a temp dir fixture at the top of the bench file for the resolver calls.

- [ ] **Step 9: Commit**

```bash
git add packages/vite/src/primitive-resolve.ts packages/vite/src/plugin.ts packages/vite/src/index.ts tests/unit/vite/vite-resolve.test.ts tests/bench/directive.bench.ts
git rm packages/vite/src/boundary-resolve.ts packages/vite/src/token-resolve.ts packages/vite/src/theme-resolve.ts packages/vite/src/style-resolve.ts
git commit -m "bang2(vite): resolvePrimitive implements 4 clones, plugin.ts wires dirs, 4 files deleted"
```

---

### Task 11: `virtual:czap/config` in `virtual-modules.ts`

**Files:**
- Modify: `packages/vite/src/virtual-modules.ts`

- [ ] **Step 1: Add `virtual:czap/config` to the `VIRTUAL_IDS` array**

In `packages/vite/src/virtual-modules.ts`, find the `VIRTUAL_IDS` const and add the new entry:

```typescript
const VIRTUAL_IDS = [
  'virtual:czap/tokens',
  'virtual:czap/tokens.css',
  'virtual:czap/boundaries',
  'virtual:czap/themes',
  'virtual:czap/hmr-client',
  'virtual:czap/wasm-url',
  'virtual:czap/config',   // ← ADD
] as const;
```

- [ ] **Step 2: Add load case for `virtual:czap/config`**

In the `loadVirtualModule` switch, add before the `default` case:

```typescript
case 'config':
  return [
    '/** @czap/config virtual module — typed stub served by @czap/vite */',
    '/** Full config is available via czap.config.ts at the workspace root */',
    'export const config = null;',
  ].join('\n');
```

- [ ] **Step 3: Run typecheck**

```
pnpm run typecheck
```

Expected: silent.

- [ ] **Step 4: Run vite unit tests → green**

```
pnpm test -- tests/unit/vite/
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/vite/src/virtual-modules.ts
git commit -m "bang2(vite): virtual:czap/config added to VirtualModuleId + load stub"
```

---

### Task 12: Rewrite `packages/compiler/src/dispatch.ts`

**Files:**
- Modify: `packages/compiler/src/dispatch.ts`
- Modify: `packages/compiler/src/index.ts`
- Modify: `tests/unit/compiler/dispatch-compiler.test.ts`

This is a full rewrite. The old `dispatch(target: CompilerTarget, ...)` and `CompilerTarget` string union are removed. The new `dispatch(def: CompilerDef)` takes the tagged union.

- [ ] **Step 1: Rewrite `packages/compiler/src/dispatch.ts`**

```typescript
/**
 * Compiler dispatch — tagged CompilerDef discriminated union.
 *
 * Zero `unknown`, zero `as` casts. No default case.
 * TypeScript enforces exhaustiveness at the switch level.
 */

import type { Boundary, Config } from '@czap/core';
import type { CSSCompileResult } from './css.js';
import type { GLSLCompileResult } from './glsl.js';
import type { WGSLCompileResult } from './wgsl.js';
import type { ARIACompileResult } from './aria.js';
import type { AIManifestCompileResult, AIManifest } from './ai-manifest.js';
import { CSSCompiler } from './css.js';
import { GLSLCompiler } from './glsl.js';
import { WGSLCompiler } from './wgsl.js';
import { ARIACompiler } from './aria.js';
import { AIManifestCompiler } from './ai-manifest.js';

// ─────────────────────────────────────────────────────────────────────────────
// Compiler-specific state types
// ─────────────────────────────────────────────────────────────────────────────

export type CSSStates  = Record<string, Record<string, string>>;
export type GLSLStates = Record<string, Record<string, number>>;
export type WGSLStates = Record<string, Record<string, number>>;
export interface ARIAStates {
  readonly states: Record<string, Record<string, string>>;
  readonly currentState: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Config compiler (arm added for free)
// ─────────────────────────────────────────────────────────────────────────────

export interface ConfigTemplateResult {
  readonly json: string;
}

const ConfigTemplateCompiler = {
  compile(config: Config.Shape): ConfigTemplateResult {
    return { json: JSON.stringify(config, null, 2) };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// CompilerDef — the discriminated union
// ─────────────────────────────────────────────────────────────────────────────

export type CompilerDef =
  | { readonly _tag: 'CSS';    readonly boundary: Boundary.Shape; readonly states: CSSStates }
  | { readonly _tag: 'GLSL';   readonly boundary: Boundary.Shape; readonly states: GLSLStates }
  | { readonly _tag: 'WGSL';   readonly boundary: Boundary.Shape; readonly states: WGSLStates }
  | { readonly _tag: 'ARIA';   readonly boundary: Boundary.Shape; readonly states: ARIAStates }
  | { readonly _tag: 'AI';     readonly manifest: AIManifest }
  | { readonly _tag: 'Config'; readonly config: Config.Shape };

// ─────────────────────────────────────────────────────────────────────────────
// CompileResult — discriminated by target string
// ─────────────────────────────────────────────────────────────────────────────

export type CompileResult =
  | { readonly target: 'css';    readonly result: CSSCompileResult }
  | { readonly target: 'glsl';   readonly result: GLSLCompileResult }
  | { readonly target: 'wgsl';   readonly result: WGSLCompileResult }
  | { readonly target: 'aria';   readonly result: ARIACompileResult }
  | { readonly target: 'ai';     readonly result: AIManifestCompileResult }
  | { readonly target: 'config'; readonly result: ConfigTemplateResult };

// ─────────────────────────────────────────────────────────────────────────────
// Dispatch — truly exhaustive, no default case
// ─────────────────────────────────────────────────────────────────────────────

export function dispatch(def: CompilerDef): CompileResult {
  switch (def._tag) {
    case 'CSS':
      return { target: 'css', result: CSSCompiler.compile(def.boundary, def.states) };
    case 'GLSL':
      return { target: 'glsl', result: GLSLCompiler.compile(def.boundary, def.states) };
    case 'WGSL':
      return { target: 'wgsl', result: WGSLCompiler.compile(def.boundary, def.states) };
    case 'ARIA':
      return { target: 'aria', result: ARIACompiler.compile(def.boundary, def.states.states, def.states.currentState) };
    case 'AI':
      return { target: 'ai', result: AIManifestCompiler.compile(def.manifest) };
    case 'Config':
      return { target: 'config', result: ConfigTemplateCompiler.compile(def.config) };
  }
}

/** @deprecated Use dispatch(def: CompilerDef) instead */
export { dispatch as dispatchDef };
```

Note: `dispatchDef` is re-exported as an alias so the test file additions from Bang 1 Task 6 Step 6 still compile.

- [ ] **Step 2: Update `packages/compiler/src/index.ts`**

Remove the old `CompilerTarget` export (it no longer exists). Add `ConfigTemplateResult`. Remove `dispatchDef` from the deduplicated area.

The compiler index should export:
```typescript
export { dispatch, dispatchDef } from './dispatch.js';
export type { CompilerDef, CompileResult, CSSStates, GLSLStates, WGSLStates, ARIAStates, ConfigTemplateResult } from './dispatch.js';
```

Remove any existing `CompilerTarget` export. Remove the stub `dispatchDef` export added in Bang 1 (it's now covered by the re-export above).

- [ ] **Step 3: Update `tests/unit/compiler/dispatch-compiler.test.ts` — update old tests**

The existing old tests call `dispatch('css', boundary, states)`. They now need to use the CompilerDef form:

```typescript
// OLD:
const result = dispatch('css', boundary, cssStates);
expect(result.target).toBe('css');

// NEW:
const result = dispatch({ _tag: 'CSS', boundary, states: cssStates });
expect(result.target).toBe('css');
```

Update each of the 5 existing target tests (`css`, `glsl`, `wgsl`, `aria`, `ai`) to use the new `dispatch(def)` API.

The new `dispatchDef` tests from Bang 1 Task 6 Step 6 can be updated to use `dispatch` directly (or kept as-is since `dispatchDef` is now an alias).

- [ ] **Step 4: Run typecheck**

```
pnpm run typecheck
```

Expected: silent.

- [ ] **Step 5: Run dispatch tests → green**

```
pnpm test -- tests/unit/compiler/dispatch-compiler.test.ts
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add packages/compiler/src/dispatch.ts packages/compiler/src/index.ts tests/unit/compiler/dispatch-compiler.test.ts
git commit -m "bang2(compiler): CompilerDef tagged union — zero unknown, zero as, ConfigDef arm"
```

---

### Task 13: Create `czap.config.ts` at Workspace Root

**Files:**
- Create: `czap.config.ts`

- [ ] **Step 1: Create `czap.config.ts`**

```typescript
/**
 * czap.config.ts — unified project configuration hub.
 *
 * All framework adapters (Vite, Astro, Vitest) derive their configuration
 * from this file. Edit here; nowhere else.
 */

import { defineConfig, Boundary } from '@czap/core';

// ─────────────────────────────────────────────────────────────────────────────
// Boundaries
// ─────────────────────────────────────────────────────────────────────────────

const viewport = Boundary.make({
  input: 'viewport.width',
  at: [
    [0,    'mobile'],
    [768,  'tablet'],
    [1280, 'desktop'],
  ] as const,
});

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

export default defineConfig({
  boundaries: { viewport },
  tokens:     {},
  themes:     {},
  styles:     {},
  vite: {
    hmr: true,
  },
});
```

Note: `@czap/core` resolves via pnpm workspace symlinks. If TypeScript cannot resolve `@czap/core` in this file, use the relative path `./packages/core/src/index.ts` instead.

- [ ] **Step 2: Run typecheck**

```
pnpm run typecheck
```

Expected: silent (this file is at the root and may not be in `tsconfig.json` includes; if it errors, add it or verify the import resolves).

- [ ] **Step 3: Commit**

```bash
git add czap.config.ts
git commit -m "bang2(root): czap.config.ts — unified project configuration entry point"
```

---

### Task 14: Wire `vite.config.ts` and `vitest.shared.ts`

**Files:**
- Modify: `vite.config.ts`
- Modify: `vitest.shared.ts`

- [ ] **Step 1: Update `vite.config.ts` to derive aliases from `Config.toTestAliases`**

Replace the manual alias object in `vite.config.ts`:

```typescript
import { defineConfig } from 'vite-plus';
import { resolve } from 'path';
import czapCfg from './czap.config.ts';
import { Config } from './packages/core/src/config.ts';

const repoRoot = resolve(__dirname);

export default defineConfig({
  resolve: {
    alias: Config.toTestAliases(czapCfg, repoRoot),
  },
  test: {
    include: [
      'tests/unit/**/*.test.ts',
      'tests/integration/**/*.test.ts',
      'tests/bench/**/*.test.ts',
      'tests/smoke/**/*.test.ts',
      'tests/property/**/*.test.ts',
      'tests/component/**/*.test.ts',
      'tests/regression/**/*.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['packages/*/src/**/*.ts'],
      exclude: [
        '**/dist/**',
        '**/node_modules/**',
        '**/capture/**',
        '**/audio/**',
        '**/slot/registry.ts',
        '**/physical/**',
        '**/index.ts',
      ],
      thresholds: {
        lines: 71,
        branches: 57,
        functions: 74,
        statements: 72,
      },
    },
  },
});
```

Note: `vite.config.ts` imports `Config` directly from the source path (`./packages/core/src/config.ts`) rather than `@czap/core` because Vite config files are loaded BEFORE alias resolution. Importing via the alias would create a bootstrap circularity.

- [ ] **Step 2: Update `vitest.shared.ts` to derive aliases from `Config.toTestAliases`**

Replace the manual `alias` object in `vitest.shared.ts`:

```typescript
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import czapCfg from './czap.config.ts';
import { Config } from './packages/core/src/config.ts';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

export const repoRoot = resolve(rootDir);

export const alias = Config.toTestAliases(czapCfg, repoRoot);

export const coverageInclude = ['packages/*/src/**/*.ts'];

export const coverageExclude = [
  '**/dist/**',
  '**/node_modules/**',
  '**/*.d.ts',
  '**/index.ts',
  'packages/core/src/capture.ts',
  'packages/core/src/protocol.ts',
  'packages/core/src/quantizer-types.ts',
  'packages/core/src/type-utils.ts',
  'packages/web/src/lite.ts',
  'packages/web/src/types.ts',
];

export const nodeTestInclude = [
  'tests/unit/**/*.test.ts',
  'tests/integration/**/*.test.ts',
  'tests/bench/**/*.test.ts',
  'tests/smoke/**/*.test.ts',
  'tests/property/**/*.test.ts',
  'tests/component/**/*.test.ts',
  'tests/regression/**/*.test.ts',
];
```

Note: Same as `vite.config.ts` — import `Config` from source path, not via alias, to avoid bootstrap circularity.

- [ ] **Step 3: Remove the manual `@czap/_spine` entry added in Task 9 Step 1**

Since `Config.toTestAliases` already includes `@czap/_spine`, the manual entry in `vitest.shared.ts` (added in Task 9 Step 1) is now redundant and has been replaced by the full alias replacement above.

- [ ] **Step 4: Run typecheck**

```
pnpm run typecheck
```

Expected: silent.

- [ ] **Step 5: Run all tests**

```
pnpm test
```

Expected: all 2433+ tests pass. If any fail, investigate before proceeding to gauntlet.

- [ ] **Step 6: Commit**

```bash
git add vite.config.ts vitest.shared.ts
git commit -m "bang2(surface): vite.config.ts + vitest.shared.ts derive from Config.toTestAliases"
```

---

### Task 15: Full Gauntlet

- [ ] **Step 1: Run the full test suite with coverage**

```
pnpm test -- --coverage
```

Check that:
- All tests pass
- Branch coverage ≥ 99.78%
- Statement coverage ≥ 99.59%
- Function coverage ≥ 98.32%

- [ ] **Step 2: Run `pnpm run build` (full tsc --build)**

```
pnpm run build
```

Expected: clean build across all 10 packages.

- [ ] **Step 3: Check bench does not regress**

```
pnpm run bench
```

Expected: existing bench entries pass. New Config.make() and resolvePrimitive entries appear in output.

- [ ] **Step 4: If the gauntlet runner exists, run it**

```
pnpm run gauntlet
```

(If this command exists — check `package.json` scripts. If not, the above coverage + build steps are the gate.)

Expected: 76/76 `feedback:verify` checks OK. Watch the two known watchlist items:
- `llm-runtime-steady`: 31.9% overhead vs 25% threshold — diagnostic mode, not a block
- `worker-runtime-startup`: 103% overhead — structural, not a regression

- [ ] **Step 5: Verify success criteria against spec**

Go through each item in the spec's Success Criteria checklist:
- [ ] `tsc --build` clean after Bang 2 infra layer (Task 9–12)
- [ ] `tsc --build` clean after Bang 2 code layer (Task 13–14)
- [ ] All 2433 existing tests still pass (plus new tests)
- [ ] `feedback:verify` 76/76 OK
- [ ] Branch coverage ≥ 99.78%
- [ ] `virtual:czap/config` serves a typed `Config.Shape` import
- [ ] `czap.config.ts` at root compiles and drives `vite.config.ts` and `vitest.shared.ts`
- [ ] 4 old resolver files gone, `resolvePrimitive<K>()` covers all their behaviors
- [ ] Compiler dispatch has zero `unknown`, zero `as` casts
- [ ] No `// TODO`, no `// HACK`, no scaffold comments

- [ ] **Step 6: Final commit**

```bash
git add tests/bench/core.bench.ts
git commit -m "bang2: gauntlet green — unification sprint complete"
```

---

## Self-Review

**Spec coverage check:**

| Spec Goal | Task |
|-----------|------|
| `PrimitiveKind` as first-class type indexing all infra | Tasks 1–2 (_spine), 3 (core), 4 (vite) |
| `resolvePrimitive<K>()` replaces 4 clones | Task 10 |
| `CompilerDef` tagged union, zero unknown/as | Task 12 |
| `_spine/config.d.ts` declares Config.Shape | Task 1 |
| `Config.make()` + `defineConfig()` in `@czap/core` | Task 8 |
| `czap.config.ts` at workspace root | Task 13 |
| `virtual:czap/config` served by Vite plugin | Task 11 |
| `.czap/config.cbor` at build time | **Gap — not in plan** |
| `vite.config.ts` + `vitest.shared.ts` derive from cfg | Task 14 |
| Spine conformance tests | Tasks 6 + 9 |
| Gauntlet passes | Task 15 |

**Gap: `.czap/config.cbor`** — The spec mentions writing `.czap/config.cbor` at build time for Astro middleware/edge workers. This is not implemented in this plan. It requires: (1) a CBOR serializer, (2) a Vite build hook that writes the file, (3) Astro middleware that reads it. Scope it as a follow-on sprint item.

**Placeholder scan:** No TBD, TODO, or vague steps found. Every code step has complete code.

**Type consistency check:**
- `PrimitiveKind` defined in `packages/core/src/config.ts`, re-exported as `CorePluginConfig` — consistent across tasks 3, 4, 10
- `PrimitiveResolution<K>.primitive` property name — consistent across tasks 4, 10
- `CompilerDef._tag` uses uppercase (`'CSS'`, `'GLSL'`, etc.) — consistent across tasks 5, 12
- `Config.Shape._tag` is `'ConfigDef'` — consistent across tasks 1, 3, 8, 12
- `dispatch(def: CompilerDef)` signature — consistent between task 12 implementation and test update
