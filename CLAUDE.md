# czap -- Claude Code Instructions

## What Is This

Constraint-based adaptive rendering framework. Quantize continuous signals into discrete states, compile to CSS/GLSL/WGSL/ARIA/AI, detect device capabilities, serve via Vite 8, hydrate via Astro 6. Generative UI pipeline treats LLM streaming as adaptive media. Off-thread compositor via Web Workers. WASM escape hatch for batch compute.

## Commands

- `pnpm run build` -- TypeScript build (`tsc --build` across 10 packages)
- `pnpm test` -- Run all tests (vitest, 2234 tests, 131 files)
- `pnpm run typecheck` -- Type check without emit
- `pnpm run bench` -- Run benchmarks (tinybench)

## Package Structure

| Package         | Path                | Description                                                                                  |
| --------------- | ------------------- | -------------------------------------------------------------------------------------------- |
| @czap/core      | packages/core/      | Primitives: Boundary, Token, Style, Theme, Signal, Compositor, ECS, HLC, DAG, Plan, AVBridge |
| @czap/quantizer | packages/quantizer/ | Q.from() builder, boundary evaluation, animated transitions, MotionTier gating               |
| @czap/compiler  | packages/compiler/  | Multi-target output: CSS, GLSL, WGSL, ARIA, AI, Tailwind (11 compilers)                      |
| @czap/web       | packages/web/       | DOM runtime: Morph, SlotRegistry, SSE client, Physical state, LLMAdapter, AudioWorklet       |
| @czap/detect    | packages/detect/    | Device capability probes, GPU tier, DesignTier/MotionTier mapping                            |
| @czap/vite      | packages/vite/      | Vite 8 plugin: @token/@theme/@style/@quantize CSS transforms + HMR                           |
| @czap/astro     | packages/astro/     | Astro 6 integration: Satellite component + client:satellite directive                        |
| @czap/edge      | packages/edge/      | CDN-edge: Client Hints, tier detection, KV boundary cache, theme compilation                 |
| @czap/worker    | packages/worker/    | Off-thread: SPSC ring buffer, compositor worker, render worker, OffscreenCanvas              |
| @czap/remotion  | packages/remotion/  | Remotion adapter: React hooks + composition helpers                                          |

Also: `crates/czap-compute/` -- Rust #![no_std] WASM crate (spring, boundary, blend kernels)

## Architecture Patterns

### Namespace Object Pattern

All modules export via namespace objects with companion type namespaces:

```ts
export const Boundary = { make: _make, evaluate: _evaluate };
export declare namespace Boundary {
  export type Shape = BoundaryShape;
}
// Usage: Boundary.make({...}), type Boundary.Shape
```

### Effect Framework

Uses Effect (v4.0.0-beta.32) for async, resource management, and streams:

- `Effect.gen(function* () { ... })` for generator-based composition
- `Effect.runSync()` for synchronous, `Effect.runPromise()` for async
- `SubscriptionRef` for reactive state, `Stream` for event sequences
- `Scope` for resource lifecycle (acquire/release pattern)

### Content Addressing

FNV-1a hash of CBOR-canonical payloads. Boundaries, quantizer configs, and receipts all have `ContentAddress` identity (`fnv1a:XXXXXXXX`). Change definition = hash changes = auto-invalidation.

### Zero-Allocation Hot Path

CompositorStatePool (ring buffer), DirtyFlags (bitmask), FrameBudget (priority lanes). No allocation during animation frames = no GC jank.

## Coding Conventions

- TypeScript strict mode, ESM only (`.js` extensions in imports)
- No default exports -- named exports only
- Branded types via `Brand.Branded<T, 'Tag'>` (Effect Brand module)
- Tests in `tests/unit/`, `tests/integration/`, `tests/bench/`
- Test runner: vitest (NOT bun:test)
- Property-based testing with fast-check where appropriate
- Imports from packages use `@czap/*` aliases (resolved via vite.config.ts in tests)

## Key Files

- `docs/ARCHITECTURE.md` -- Full system architecture, dependency DAG, compilation pipeline
- `docs/adr/0002-zero-alloc.md` -- Zero-allocation hot path discipline (pool, dirty flags, dense ECS, microtask batching)
- `docs/adr/0004-plan-coordinator.md` -- Plan IR vs RuntimeCoordinator split (per-tick phase sequencing)
- `docs/STATUS.md` -- Test gates, known limitations, future work
- `vite.config.ts` -- Test aliases mapping @czap/\* to source
- `packages/core/src/index.ts` -- All core exports (50+ modules)

## Testing Tips

- `pnpm test -- --reporter=verbose` for detailed output
- `pnpm test -- tests/unit/compositor.test.ts` to run single file
- Property tests use `fc.assert(fc.property(...))` from fast-check
- Integration tests in `tests/integration/` verify cross-package wiring
- Some tests use `Effect.runSync(Effect.scoped(...))` for scoped resources
