# ADR-0006 — Compiler dispatch tagged union

**Status:** Accepted
**Date:** 2026-04-22

## Context

The CZAP compiler casts adaptive UI definitions to multiple output targets: CSS, GLSL, WGSL, ARIA, AI function-call manifest, config template (six targets today, more expected). All targets share a uniform invocation surface through `dispatch(def: CompilerDef)` in `packages/compiler/src/dispatch.ts`: a discriminated union over `_tag: 'CSSCompiler' | 'GLSLCompiler' | 'WGSLCompiler' | 'ARIACompiler' | 'AICompiler' | 'ConfigCompiler'`.

CSS is the most frequently-used target. The engine explicitly supports plugin extensibility: third-party compilers should be first-class citizens, not second-class. The compile path runs at Vite build/HMR time, Astro SSR time, and edge theme-cache warm time. Never per frame or per render tick. Compilation outputs are content-addressed via FNV-1a + CBOR (see `fnv.ts`, `typed-ref.ts`, `memo-cache.ts`); identical definitions compile once and are cached by hash.

## Decision

`dispatch(def: CompilerDef)` is the canonical compiler API. Direct calls to `CSSCompiler.compile()`, `GLSLCompiler.compile()`, etc. are permitted internally (e.g., for compilers chaining their output through another) but are not promoted as a user-facing fast path. A user always goes through `dispatch`.

## Consequences

- **One API surface.** Adding a new compiler target is a one-line union arm + one switch case. Plugin authors use the same entry point as built-in compilers; no "core is fast, plugins are slow" hierarchy.
- **Dispatch adds ~150ns per call** over direct: 9% on the 1.6μs CSS compile path, measured in `tests/bench/compiler.bench.ts`. Well under the 15% hard-gate threshold enforced by `scripts/bench-gate.ts`.
- **Content-addressed caching amortizes the cost.** Each unique definition compiles once per content hash; dispatch overhead is paid once per hash, not per render, request, or tick.
- **Type safety end-to-end.** `CompilerDef` is exhaustively switched; a missing case is a compile error. No `any`, `unknown`, or type assertions in `dispatch()` itself.

## Evidence

Bench: `CSSCompiler.compile() -- direct` at 1660ns mean vs `dispatch() -- CSSCompiler tag` at 1808ns mean (source: `tests/bench/compiler.bench.ts`). Median overhead: 9%. `bench:gate` hard threshold: 15%. Committed bench artifact: `benchmarks/directive-gate.json`.

## Rejected alternatives

- **Two-tier API (promoted direct + fallback dispatch):** Would save ~150ns on a cached path but bifurcates the public surface and relegates plugin compilers to second class. Architectural debt for a micro-optimization.
- **Compile-time tag elision via generic specialization:** Possible via advanced TypeScript gymnastics, but the maintenance cost outweighs the benefit on a non-hot path.

## Scope and the standalone-compiler tier

`dispatch()` is the canonical entry for the six target-emission compilers — `CSSCompiler`, `GLSLCompiler`, `WGSLCompiler`, `ARIACompiler`, `AICompiler`, `ConfigCompiler` — each of which projects a boundary's named states to one downstream output target.

The compiler package also ships a separate tier of standalone compilers that operate on a *single primitive* rather than a boundary-keyed state map: `TokenCSSCompiler`, `TokenJSCompiler`, `TokenTailwindCompiler`, `ThemeCSSCompiler`, `StyleCSSCompiler`, `ComponentCSSCompiler`. These are not arms of `CompilerDef`; they are direct call surfaces with their own input shapes. They do not share the `dispatch()` invariant because they don't share its input contract.

A new compiler that maps a boundary to a target output joins `CompilerDef` and goes through `dispatch()`. A new compiler that operates on a Token, Theme, Style, or Component primitive ships standalone, alongside the existing six in `packages/compiler/src/`.

## References

- `packages/compiler/src/dispatch.ts`: canonical dispatch + `CompilerDef` union
- `packages/compiler/src/index.ts`: full export surface, including the standalone-compiler tier
- `tests/bench/compiler.bench.ts`: direct vs dispatch bench pair
- `scripts/bench-gate.ts`: hard-gate threshold enforcement
