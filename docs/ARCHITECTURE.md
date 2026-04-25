# czap Architecture

czap is a constraint-based adaptive rendering framework. This document is a **structural index** — the authoritative content lives in:

- **Code** — [`docs/api/`](./api/) (TypeDoc-generated from source TSDoc).
- **Decisions** — [`docs/adr/`](./adr/) (why each non-obvious choice was made).
- **Status** — [`docs/STATUS.md`](./STATUS.md) (live test gates, perf numbers, watch items).

## Package DAG

```text
core ─┬─> quantizer ─> compiler ──┐
      │                           │
      ├─> detect ─────┐           │
      │               │           │
      ├─> worker      ├─> edge    │
      │               │           │
      ├─> remotion    │           │
      │               │           │
      └─> + vite + web + edge ────┴─> astro
```

Plus `crates/czap-compute/` — Rust `#![no_std]` WASM crate (spring, boundary, blend kernels).

## Packages

| Package | API docs | Notes |
|---|---|---|
| @czap/core | [api/core/](./api/core/) | Boundary, Token, Style, Theme, Compositor, ECS, Plan, RuntimeCoordinator, FNV/CBOR content addressing |
| @czap/quantizer | [api/quantizer/](./api/quantizer/) | `Q.from()` builder, animated transitions, MotionTier gating |
| @czap/compiler | [api/compiler/](./api/compiler/) | Tagged-union dispatch over CSS / GLSL / WGSL / ARIA / AI / Tailwind targets |
| @czap/web | [api/web/](./api/web/) | DOM runtime: Morph, SlotRegistry, SSE, LLMAdapter, AudioWorklet |
| @czap/detect | [api/detect/](./api/detect/) | Capability probes; DesignTier/MotionTier mapping |
| @czap/vite | [api/vite/](./api/vite/) | Vite 8 plugin: `@token`/`@theme`/`@style`/`@quantize` transforms + HMR |
| @czap/astro | [api/astro/](./api/astro/) | Astro 6 integration; `Satellite` + `client:satellite` |
| @czap/edge | [api/edge/](./api/edge/) | CDN-edge: Client Hints, tier detection, KV boundary cache |
| @czap/worker | [api/worker/](./api/worker/) | Off-thread: SPSC ring, compositor worker, render worker, OffscreenCanvas |
| @czap/remotion | [api/remotion/](./api/remotion/) | Remotion adapter: hooks + composition helpers |

## Architectural Decisions

See [`docs/adr/README.md`](./adr/README.md) for the full index. Foundational ADRs:

- [0001 — Namespace pattern + branded types](./adr/0001-namespace-pattern.md)
- [0002 — Zero-allocation hot path discipline](./adr/0002-zero-alloc.md)
- [0003 — Content addressing via FNV-1a + CBOR](./adr/0003-content-addressing.md)
- [0004 — Plan IR vs RuntimeCoordinator split](./adr/0004-plan-coordinator.md)
- [0005 — Effect boundary rules](./adr/0005-effect-boundary.md)
- [0006 — Compiler dispatch tagged union](./adr/0006-compiler-dispatch.md)

## Where to start

- New contributors: read [ADR-0001](./adr/0001-namespace-pattern.md) and [ADR-0002](./adr/0002-zero-alloc.md), then skim `packages/core/src/boundary.ts` + `compositor.ts`.
- Framework usage: [api/core/](./api/core/) → Boundary, Token, Style, Theme.
- Adding a compile target: [ADR-0006](./adr/0006-compiler-dispatch.md) + `packages/compiler/src/dispatch.ts`.
- Off-thread / WASM: [ADR-0002](./adr/0002-zero-alloc.md) + `packages/worker/` + `crates/czap-compute/`.

## Capsule Factory + Video Stack (2026-04-23)

Full details: [capsule-factory.md](./capsule-factory.md) — factory kernel, scene stack, assets, CLI/MCP, spine bridge.
