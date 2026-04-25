# ADR-0001 — Namespace object pattern + branded types

**Status:** Accepted
**Date:** 2026-04-21

## Context

czap spans 10 packages and 50+ primitive modules (Boundary, Token, Style, Theme, Signal, Cell, Compositor, Plan, ...). Each primitive needs a factory (`make`), a handful of operations (`evaluate`, `pipe`, `diff`, ...), and a type surface its shape is referenced by. The framework is ESM-only, strict TypeScript, and targets tree-shakable bundling from edge to browser. Many primitive values carry domain meaning plain types can't express (a `ContentAddress` is not just a string; a `ThresholdValue` is not just a number).

## Decision

Every module exports via the **namespace-object + declared-namespace** pattern:

```ts
export const Boundary = { make: _make, evaluate: _evaluate };
export declare namespace Boundary { export type Shape = BoundaryDef; }
```

Branded types use `Brand.Branded<T, 'Tag'>` — or the unique-symbol equivalent used in `packages/core/src/brands.ts`. Factory functions in `brands.ts`, and a small adjacent set (`ecs.ts` for `EntityId`, `web/types.ts` for `SlotPath`), are the **only** sanctioned brand-construction sites. Consumer code routes through them; inline casts to branded types are lint errors.

## Consequences

- Tree-shakable: `const` object on a named export, not a class — unused arms drop at bundling.
- Grep-friendly, stable usage: every call site reads `X.make(...)`, `X.evaluate(...)`, uniform `X.Shape` type access.
- No `new` ceremony, no instance-per-value overhead.
- Branded types enforce nominal identity at zero runtime cost.
- Trade-off: `declare namespace X` beside `const X` is unfamiliar to ES-class-oriented reviewers — but once learned, the pattern composes cleanly with ESM tree-shaking in a way classes never do.

## Evidence

40+ core modules follow the pattern — `boundary.ts`, `token.ts`, `style.ts`, `theme.ts`, `compositor.ts`, `plan.ts`, `signal.ts`, `cell.ts`, `derived.ts`, `wire.ts`, `zap.ts`, `timeline.ts`, `gen-frame.ts`, `receipt.ts`, and onwards. The sanctioned-brand-factories list lives in `eslint.config.js`; the ESLint pipeline enforces zero inline brand casts across packages.

## Rejected alternatives

- **ES classes** — no tree-shake, `new` ceremony, instance-per-value allocation on a hot path.
- **Bare function exports** — loses grouping and type co-location; call sites become a salad of free functions.
- **TypeScript `namespace` blocks** — historical, collides awkwardly with ESM bundlers.

## References

- `packages/core/src/boundary.ts` — canonical example of the pattern
- `packages/core/src/brands.ts` — branded type factories
- `packages/core/src/typed-ref.ts` — branded reference wrappers
- `eslint.config.js` — sanctioned brand-construction files
- `CLAUDE.md` §Architecture Patterns
