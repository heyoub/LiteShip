# LiteShip — Claude Code instructions

## What Is This

**LiteShip** is the product: constraint-shaped adaptive projection — quantize continuous signals into discrete bearings, **cast** to CSS/GLSL/WGSL/ARIA/AI, detect device capabilities, serve via Vite 8, hydrate via Astro 6. The **CZAP** engine (*Content-Zoned Adaptive Projection*) is the technical core; **`@czap/*`** is the npm namespace (unchanged). Generative UI treats LLM streaming as adaptive media. Off-thread compositor via Web Workers. WASM escape hatch for batch compute.

Naming for prose: [docs/GLOSSARY.md](./docs/GLOSSARY.md).

## Commands

### Build / test / typecheck

- `pnpm run build` -- TypeScript build (`tsc --build` across 14 compiled packages; `@czap/_spine` is type-only)
- `pnpm test` -- Run all tests (vitest; last green main: ~241 files / ~3098 tests — always trust local `pnpm test` output)
- `pnpm run typecheck` -- Type check without emit
- `pnpm run bench` -- Run benchmarks (tinybench)

### Dev experience (cast off / discovery)

- `pnpm setup` -- Guided shakedown: doctor → install (if needed) → build → test. First-run aggregate.
- `pnpm run doctor` (or `pnpm exec czap doctor`) -- Preflight rig check. JSON receipt + pretty TTY summary. Add `--fix` to auto-remediate the cheap cases (rebuild stale dist, link missing git hook), or `--ci` to fail on warnings.
- `pnpm scripts` -- The deck plan: every npm script grouped by purpose.
- `pnpm exec czap help` -- The chart: CLI verb table grouped by phase.
- `pnpm exec czap glossary [term]` -- Ontology lookup (maritime register + product naming).
- `pnpm exec czap completion <bash|zsh|fish>` -- Emit a shell tab-completion script.

JSON receipts on every CLI command (`status`, `command`, `timestamp`, plus command-specific fields). Pretty TTY summaries go to stderr only; receipts on stdout stay machine-clean. Exception: `czap completion <shell>` emits a raw shell-completion script to stdout (no JSON wrapper) so `eval "$(czap completion bash)"` works directly.

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
| @czap/scene     | packages/scene/     | ECS-backed scene composition + timeline authoring                                            |
| @czap/assets    | packages/assets/    | Asset capsules + analysis projections (audio waveform, beat markers, …)                    |
| @czap/cli       | packages/cli/        | `czap` CLI — AI-first JSON I/O + MCP bridge                                                 |
| @czap/mcp-server | packages/mcp-server/ | Model Context Protocol server over capsule factory dispatch                                |
| @czap/_spine    | packages/_spine/     | Type-only declaration spine shared across published `.d.ts` output                           |

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

- `docs/GLOSSARY.md` -- LiteShip / CZAP / `@czap/*` naming and prose register
- `docs/ARCHITECTURE.md` -- Full system architecture, dependency DAG, projection pipeline
- `docs/adr/0002-zero-alloc.md` -- Zero-allocation hot path discipline (pool, dirty flags, dense ECS, microtask batching)
- `docs/adr/0004-plan-coordinator.md` -- Plan IR vs RuntimeCoordinator split (per-tick phase sequencing)
- `docs/STATUS.md` -- Test gates, known limitations, future work
- `vite.config.ts` -- Test aliases mapping @czap/\* to source
- `packages/core/src/index.ts` -- All core exports (50+ modules)

## Testing Tips

- `pnpm test -- --reporter=verbose` for detailed output
- `pnpm test -- tests/unit/compositor.test.ts` to run single file
- Property tests use `fc.assert(fc.property(...))` from fast-check
- Integration tests in `tests/integration/` verify cross-package rigging
- Some tests use `Effect.runSync(Effect.scoped(...))` for scoped resources
