# Czap Unification Sprint — Design Spec
**Date:** 2026-04-14  
**Status:** Approved  
**Scope:** Greenfield, zero users, big bang — no backward compat shims

---

## Context

The czap codebase is in excellent shape: 2433 tests, 131 files, 99.78% branch coverage, gauntlet passing clean in ~25 minutes with 76/76 feedback integrity checks. This sprint is not remediation — it is **reduction and addition on an already-correct system**.

Three confirmed violations exist (Banana Slip Theorem):
1. Four structurally identical resolver functions in `@czap/vite` — 339 lines → ~85
2. Four unused dead fields in `PluginConfig` that promise configurability that doesn't exist
3. Compiler dispatch using `unknown` + `as` type assertions instead of a tagged discriminated union

Two confirmed islands:
1. `_spine/` — perfect type contracts, zero runtime connection, types duplicated in implementations
2. `virtual:czap/config` — doesn't exist yet, leaving the config system fragmented across `vite.config.ts`, `vitest.shared.ts`, and framework adapter configs

One new capability:
- `czap.config.ts` as the unified project config hub, projecting into all framework adapters via pure isomorphic functions, served as `virtual:czap/config` via the existing Vite plugin infrastructure

The sprint does both: reduction (eliminate violations) + addition (config hub). No scaffolding. No migration layers. Delete wrong things, write right things.

---

## Goals

1. `PrimitiveKind = 'boundary' | 'token' | 'theme' | 'style'` as a first-class type that indexes all resolver, virtual module, config, test, and bench infrastructure — TypeScript enforces completeness at every callsite
2. Generic `resolvePrimitive<K extends PrimitiveKind>()` replaces 4 clones — one implementation, one test suite, user-configurable via `dirs`
3. Compiler dispatch rewritten as tagged `CompilerDef` discriminated union — zero `unknown`, zero `as` casts, truly exhaustive switch, `ConfigDef` arm added for free
4. `_spine/config.d.ts` declares `Config.Shape` and `defineConfig()` — type contract exists before implementation
5. `Config.make()` + `defineConfig()` implemented in `@czap/core` — content-addressed, frozen, FNV-1a hashed
6. `czap.config.ts` at workspace root — single human/agent-facing entry point for all project configuration
7. `virtual:czap/config` served by existing Vite plugin — DI via virtual module, same pattern as `virtual:czap/tokens` etc.
8. `.czap/config.cbor` written at build time — Astro middleware and edge workers read this, no Vite needed at runtime
9. `vite.config.ts` and `vitest.shared.ts` derive from `czap.config.ts` — manual alias duplication eliminated
10. Spine conformance tests in gauntlet — `_spine` contracts are enforced, not just documented
11. Gauntlet passes clean after both Bang 2 steps — 99.78% branch coverage maintained or improved

---

## Non-Goals

- No backward compatibility layers — greenfield, zero users
- No `// TODO: remove this later` scaffolding
- No ECS↔Composable entity model unification — separate sprint
- No property test feedback-loop automation — separate sprint
- No new compiler targets beyond ConfigDef — scope discipline
- No publishing `_spine` externally — `private: true` workspace package only
- No coverage reduction — every new function gets a test in Bang 1

---

## Architecture

### Layer 1: Type Contracts (`_spine/`)

Pure `.d.ts`. `noEmit: true`. Gets `package.json` with `"name": "@czap/_spine", "private": true` so it can be aliased in `vitest.shared.ts` and referenced in conformance tests without publishing.

**New files:**
```
_spine/config.d.ts    — Config.Shape, defineConfig() declaration
```

**Modified files:**
```
_spine/vite.d.ts      — PrimitiveKind type added, PluginConfig.dirs replaces 4 dead fields
_spine/package.json   — new file, makes package importable in workspace
```

`Config.Shape` in `_spine/config.d.ts` imports from `./core.d.ts` and `./design.d.ts` and `./vite.d.ts` and `./astro.d.ts` — no circular deps since everything is type-only.

The `unique symbol` brand strategy: `_spine` declares brands once. Runtime packages `import type { ... } from '@czap/_spine'` for the type, add only constructors/implementations. No redeclaration of brand symbols in implementations — eliminates the 100% type duplication.

### Layer 2: Core Infra

**New files:**
```
packages/core/src/config.ts           — Config.make(), Config.compose(),
                                         Config.toViteConfig(), Config.toAstroConfig(),
                                         Config.toTestAliases(), defineConfig()
packages/vite/src/primitive-resolve.ts — resolvePrimitive<K extends PrimitiveKind>()
```

**Rewritten files:**
```
packages/compiler/src/dispatch.ts     — CompilerDef tagged union, truly exhaustive switch
packages/vite/src/plugin.ts           — PluginConfig.dirs replaces 4 dead fields
packages/vite/src/virtual-modules.ts  — virtual:czap/config added to VirtualModuleId union
```

**Deleted files:**
```
packages/vite/src/boundary-resolve.ts  ← replaced by resolvePrimitive('boundary', ...)
packages/vite/src/token-resolve.ts     ← replaced by resolvePrimitive('token', ...)
packages/vite/src/theme-resolve.ts     ← replaced by resolvePrimitive('theme', ...)
packages/vite/src/style-resolve.ts     ← replaced by resolvePrimitive('style', ...)
```

Callers in `plugin.ts` and transform files update to `resolvePrimitive(kind, name, fromFile, root, config?.dirs)`. Same behavior, one implementation, now actually wires the `dirs` config.

**`CompilerDef` shape:**
```typescript
type CompilerDef =
  | { readonly _tag: 'CSS';    readonly boundary: Boundary.Shape; readonly states: CSSStates }
  | { readonly _tag: 'GLSL';   readonly boundary: Boundary.Shape; readonly states: GLSLStates }
  | { readonly _tag: 'WGSL';   readonly boundary: Boundary.Shape; readonly states: WGSLStates }
  | { readonly _tag: 'ARIA';   readonly boundary: Boundary.Shape; readonly states: ARIAStates }
  | { readonly _tag: 'AI';     readonly manifest: AIManifest }
  | { readonly _tag: 'Config'; readonly config: ConfigDef };
// No default case. TypeScript enforces exhaustiveness.
```

### Layer 3: Project Surface

**New files:**
```
czap.config.ts                         — defineConfig({boundaries, tokens, ...})
tests/unit/spine-conformance.ts        — satisfies checks, all implementations vs spine
tests/helpers/primitive-harness.ts     — PRIMITIVE_KINDS, resolverSuite(), shared arbitraries
```

**Modified files:**
```
vite.config.ts                         — derives plugin config from czap.config.ts
vitest.shared.ts                       — derives aliases from Config.toTestAliases(cfg)
_spine/vite.d.ts                       — VirtualModuleId union extended with virtual:czap/config
```

---

## Execution Model

**Two-bang. Not two-phase.**

Bang 1 produces only static artifacts — types, interfaces, failing tests, bench stubs, property arbitraries. Zero implementation. `tsc --noEmit` is the only compiler invocation. When `tsc --noEmit` is silent and all tests exist and are red, Bang 1 is complete.

Bang 2 implements to green. Infra layer first, code layer second. The compiler runs `tsc --build` exactly twice — once per layer. If a layer fails compilation, Bang 1 was incomplete for that layer. Return to Bang 1, finish the thought, then retry.

**The rule:** If you can't write the test in Bang 1, the idea is not fully formed. No half-formed ideas enter Bang 2.

**The compiler is a collaborator, not a target.** Compiler errors in Bang 2 are diagnostic signals that reveal gaps in Bang 1 thinking. They are not bugs to suppress.

### Bang 2 red-green sequence (infra layer)

```
1. Config.make() tests green           → packages/core/src/config.ts lands
2. Config projection tests green       → toViteConfig, toAstroConfig, toTestAliases
3. Spine conformance tests green       → _spine/package.json wired, brand imports correct
4. resolvePrimitive() tests green      → primitive-resolve.ts lands, 4 old files deleted
5. virtual:czap/config tests green     → virtual-modules.ts extended
6. Compiler dispatch tests green       → dispatch.ts rewritten, no unknown, no as
```

Each step: `tsc --noEmit` → `vitest run [specific file]`. Green = move. Red = the test tells you exactly what's missing.

### Bang 2 red-green sequence (code layer)

```
7. czap.config.ts compiles             → root file created, tsc --build clean
8. vite.config.ts derives correctly    → manual aliases removed, derives from cfg
9. vitest.shared.ts derives correctly  → Config.toTestAliases(cfg) wires in
10. Gauntlet full run passes           → 99.78%+ branch coverage confirmed
```

---

## Data Flow

```
czap.config.ts
  defineConfig({ boundaries, tokens, themes, styles, components, vite?, astro? })
        ↓
  Config.Shape  (ContentAddress = FNV-1a(canonical JSON), frozen, _tag: 'ConfigDef')
        ↓
  ┌────────────────┬──────────────────┬─────────────────────┬──────────────────┐
  │                │                  │                     │                  │
cfg.vite      cfg.boundaries    virtual:czap/config    .czap/config.cbor   cfg aliases
  ↓                ↓                  ↓                     ↓                  ↓
Vite plugin   Vite resolver     app imports            Astro middleware    vitest.shared
(build time)  (convention +     (runtime, typed)       (edge/SSR,         (test aliases,
              user dirs)                               no Vite needed)     no manual list)
```

**Projection functions** (pure, no side effects):
- `Config.toViteConfig(cfg)` → `PluginConfig`
- `Config.toAstroConfig(cfg)` → `IntegrationConfig`  
- `Config.toTestAliases(cfg)` → `Record<string, string>`

**Content address invariant:** If anything in `czap.config.ts` changes, `cfg.id` changes. HMR fires. Only virtual modules whose upstream inputs changed need reloading. Deterministic invalidation, not file-watcher heuristics.

---

## Test Strategy

### Primitive harness — parameterized, not cloned

```typescript
// tests/helpers/primitive-harness.ts
export const PRIMITIVE_KINDS = ['boundary', 'token', 'theme', 'style'] as const satisfies PrimitiveKind[];

// One test suite definition → four parameterized runs via test.each
export function resolverSuite(kind: PrimitiveKind) {
  return {
    sameDir:     /* same-dir {kind}s.ts convention */,
    wildcard:    /* *.{kind}s.ts wildcard */,
    rootFallback:/* project root {kind}s.ts */,
    userDirOverride: /* NEW: dirs[kind] config actually works */,
    notFound:    /* null when no file exists */,
  };
}
```

### Shared arbitraries — property tests and bench use same generators

```typescript
export const arbPrimitiveKind = fc.constantFrom(...PRIMITIVE_KINDS);
export const arbPrimitiveShape = (kind: PrimitiveKind): fc.Arbitrary<PrimitiveShape<typeof kind>> => ...;
export const arbConfig = fc.record({
  boundaries: fc.dictionary(fc.string({ minLength: 1 }), arbPrimitiveShape('boundary')),
  tokens:     fc.dictionary(fc.string({ minLength: 1 }), arbPrimitiveShape('token')),
  ...
});
```

### Spine conformance tests

```typescript
// tests/unit/spine-conformance.ts
import type * as SpineCore from '@czap/_spine';
import * as CoreImpl from '@czap/core';
import * as ViteImpl from '@czap/vite';

// Structural check: runtime satisfies spine contract
const _boundary: SpineCore.Boundary = CoreImpl.Boundary;       // type error if shapes diverge
const _plugin:   SpineCore.plugin   = ViteImpl.plugin;         // ditto
// ... all public namespaces checked
```

### Bench additions

```typescript
// In tests/bench/core.bench.ts — add:
bench('Config.make() -- full project config', () => Config.make({ boundaries: {...}, tokens: {...} }));
bench('Config.toViteConfig() -- projection', () => Config.toViteConfig(testCfg));

// In tests/bench/directive.bench.ts — add:
PRIMITIVE_KINDS.forEach(kind => {
  bench(`resolvePrimitive(${kind}) -- same-dir hit`, () => resolvePrimitive(kind, 'primary', ...));
});
```

### Coverage invariant

- Every new exported function: at least one unit test in Bang 1
- Every new branch: explicit test case
- Floor: 99.78% branches, 99.59% statements, 98.32% functions — must not drop
- `compositor-types.ts` (currently 0% node, type-only): add to coverage exclude list or delete if unused

---

## Files Inventory

### Created (7)
```
packages/_spine/package.json
packages/_spine/config.d.ts
packages/core/src/config.ts
packages/vite/src/primitive-resolve.ts
czap.config.ts
tests/unit/spine-conformance.ts
tests/helpers/primitive-harness.ts
```

### Modified (8)
```
packages/_spine/vite.d.ts         PrimitiveKind + dirs field
packages/compiler/src/dispatch.ts  CompilerDef tagged union
packages/vite/src/plugin.ts        dirs field, callers updated
packages/vite/src/virtual-modules.ts  virtual:czap/config
vite.config.ts                     derives from czap.config.ts
vitest.shared.ts                   derives aliases from cfg
tests/bench/core.bench.ts          Config bench entries
tests/bench/directive.bench.ts     PrimitiveKind bench entries
```

### Deleted (4)
```
packages/vite/src/boundary-resolve.ts
packages/vite/src/token-resolve.ts
packages/vite/src/theme-resolve.ts
packages/vite/src/style-resolve.ts
```

### Test files added (or extended in Bang 1)
```
tests/unit/core/config.test.ts          new — Config.make(), projections, content address
tests/unit/vite/vite-resolve.test.ts    extended — resolvePrimitive(), user dir override
tests/unit/compiler/dispatch-compiler.test.ts  extended — CompilerDef union, ConfigDef arm
tests/unit/spine-conformance.ts         new — structural satisfies checks
tests/property/config.prop.test.ts      new — arbConfig, determinism invariants
```

---

## Gauntlet Watchlist

Two diagnostic signals from the most recent gauntlet run to monitor (not block):

1. **`llm-runtime-steady`**: 31.9% overhead vs 25% threshold, 4/5 replicates exceed. Diagnostic mode, not hard gate. Session management layer adding ~32% overhead over raw JSON parsing. Monitor — if this gets worse after the sprint, investigate.

2. **`worker-runtime-startup`**: 103% overhead, dominant seam `state-delivery:message-receipt` at 96% worker-only share. This is largely structural (postMessage boundary cost) not a regression. Monitor.

These are noted in the spec so they appear in the post-sprint diff baseline, not as new regressions.

---

## Success Criteria

- [ ] `tsc --build` clean after Bang 2 infra layer
- [ ] `tsc --build` clean after Bang 2 code layer  
- [ ] All 2433 existing tests still pass (plus new tests)
- [ ] `feedback:verify` 76/76 OK (new checks added for Config artifacts)
- [ ] Branch coverage ≥ 99.78%
- [ ] `virtual:czap/config` serves a typed `Config.Shape` import
- [ ] `czap.config.ts` at root compiles and drives `vite.config.ts` and `vitest.shared.ts`
- [ ] 4 old resolver files gone, `resolvePrimitive<K>()` covers all their behaviors
- [ ] Compiler dispatch has zero `unknown`, zero `as` casts
- [ ] No `// TODO`, no `// HACK`, no scaffold comments
- [ ] Gauntlet passes full run

---

## Constraint Reminder

Greenfield. Zero users. No scaffolding. No backward compat. No half-formed ideas in Bang 2.

The compiler is the scribe. Tests are the proof. Ideas prove themselves into existence or they don't exist.
