# ADR-0010: Spine as Canonical Type Source

**Status:** Accepted
**Date:** 2026-04-23

## Context

`packages/_spine/` contains 13 `.d.ts` files (~90K+ lines) with comprehensive branded-type contracts for every package. Until this ADR, `_spine` had zero runtime imports: 100% type duplication between `_spine` and each implementation package's `brands.ts`. Classic Island Syndrome.

The capsule factory needs a canonical type source. Declaring capsule contracts that themselves duplicate types across `_spine` and implementation packages would inherit the duplication.

## Decision

- `_spine` becomes the single source of truth for branded types (`SignalInput`, `ThresholdValue`, `StateName`, `ContentAddress`, `TokenRef`, `Millis`, and future additions).
- Implementation packages (starting with `packages/core/src/brands.ts`) re-export types FROM `_spine` via the `import type X as _X` + `export type X = _X` aliasing pattern (required to avoid `isolatedModules` conflicts with same-named const constructor exports) and keep only their runtime constructors.
- `CapsuleContract` imports its structural types (e.g. `ContentAddress`) from `@czap/_spine`.
- A `TypeValidator` helper in `packages/core/src/capsule.ts` uses `_spine`-derived schemas for runtime validation of capsule inputs via `Schema.decodeUnknownEffect`.
- `_spine` is referenced from `tsconfig.json` project references (first entry, since it is a declaration-only dependency-free package) and `vitest.shared.ts` aliases (`'@czap/_spine'` → `packages/_spine/index.d.ts`).
- `packages/core/tsconfig.json` carries a `paths` mapping for `@czap/_spine` so `tsc --build` resolves the import during composite builds.

## Consequences

- Eliminates 100% type duplication. Types change in one place.
- Runtime validation bridges contracts to implementation. `_spine` stops being documentation-only.
- Future contributors have one authoritative type location.
- `_spine` participates in builds and tests, so drift is caught by the existing gauntlet.
- Branded-type additions now land in `_spine/core.d.ts` (or the appropriate `_spine/*.d.ts` file) BEFORE the implementation package re-exports them. The ADR enforces the order to keep the bridge honest.

## Supporting evidence

- `packages/core/src/brands.ts`: re-export pattern for six branded types (`SignalInput`, `ThresholdValue`, `StateName`, `ContentAddress`, `TokenRef`, `Millis`).
- `packages/core/src/capsule.ts`: `import type { ContentAddress } from '@czap/_spine'`; `TypeValidator.validate` uses `Schema.decodeUnknownEffect`.
- `tsconfig.json` references include `./packages/_spine` as the first entry.
- `vitest.shared.ts` alias: `'@czap/_spine': resolve(repoRoot, 'packages/_spine/index.d.ts')`.
- `packages/_spine/core.d.ts`: `Millis` added here (was absent before this ADR shipped) to unblock the `brands.ts` re-export.

## References

- `docs/adr/0008-capsule-assembly-catalog.md` (paired factory ADR)
