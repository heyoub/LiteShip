# ADR-0004 — Plan IR vs RuntimeCoordinator split

**Status:** Accepted
**Date:** 2026-04-21

## Context

The compositor runs a fixed sequence of phases per tick: `compute-discrete` → `compute-blend` → `emit-css` → `emit-glsl` → `emit-aria`. A first-pass implementation would hardcode this as a method on the compositor. But the CZAP engine's ambitions (audio graphs, AV pipelines, render graphs, future `@czap/remotion` composition) need the same kind of scheduler over different phase vocabularies. Hardcoding the compositor's phases into the scheduler forecloses reuse; inlining the scheduler into each domain duplicates it.

## Decision

Separate **`Plan`** (IR, `packages/core/src/plan.ts`) from **`RuntimeCoordinator`** (execution, `packages/core/src/runtime-coordinator.ts`). Plan is a generic DAG of steps + edges (`seq` / `par` / `choice`) with arbitrary metadata. RuntimeCoordinator is the adapter that binds compositor-specific phases (`compute-discrete`, `compute-blend`, `emit-css`, `emit-glsl`, `emit-aria`) onto Plan's structure. Plan knows nothing about compositor phases; RuntimeCoordinator is the single binding point.

## Consequences

- **Plan is reusable.** Future domains (audio graphs, AV pipelines, render graphs) author their own Plans with their own phase vocabulary; the IR doesn't care.
- **RuntimeCoordinator is the single place where phase-to-execution semantics live.** Changing phase ordering, adding a phase, or renaming a phase means editing one file.
- **Non-obvious on first read.** A reader expecting a monolithic scheduler has to follow `plan.ts → runtime-coordinator.ts → compositor.ts` to see the full picture. This ADR exists in part to make that path legible.
- **Metadata is the implicit contract.** RuntimeCoordinator reads `step.metadata.phase` to determine execution order. Metadata keys are namespaced conventions, not type-level guarantees. A future improvement is a typed `Phase` brand (deferred).

## Evidence

- `packages/core/src/plan.ts`: IR builder, topo-sort, validation.
- `packages/core/src/runtime-coordinator.ts`: Plan template + `orderedPhases()` binding.
- `packages/core/src/compositor.ts`: consumer that drives its per-tick work through the coordinator.
- `tests/unit/core/plan.test.ts`: Plan IR semantics.
- `tests/unit/core/runtime-coordinator.test.ts`: phase-to-Plan binding.

## Rejected alternatives

- **Monolithic `Compositor.scheduler` with hardcoded phases**: couples domain semantics to execution engine; not reusable by audio / AV / render graphs.
- **Phase-typed Plan (generic over a phase union)**: ergonomic cost at author time; stateless phases don't actually need typing at the IR level; deferred as a future improvement once a second domain lands and the shape stabilizes.

## References

- `packages/core/src/plan.ts`
- `packages/core/src/runtime-coordinator.ts`
- `packages/core/src/compositor.ts`
- `tests/unit/core/plan.test.ts`
- `tests/unit/core/runtime-coordinator.test.ts`
