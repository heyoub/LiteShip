# LiteShip architecture

Slim structural index. Deeper explanation lives in the linked docs.

*LiteShip — powered by the CZAP engine (Content-Zoned Adaptive Projection), distributed as `@czap/*` packages on npm.*

Prose vocabulary: [GLOSSARY.md](./GLOSSARY.md).

- Mental model: [`ASTRO-STATIC-MENTAL-MODEL.md`](./ASTRO-STATIC-MENTAL-MODEL.md), [`AUTHORING-MODEL.md`](./AUTHORING-MODEL.md), and [`ASTRO-RUNTIME-MODEL.md`](./ASTRO-RUNTIME-MODEL.md).
- Public surfaces: [`PACKAGE-SURFACES.md`](./PACKAGE-SURFACES.md) and [`docs/api/`](./api/) (TypeDoc-generated from source TSDoc).
- Decisions: [`docs/adr/`](./adr/), where each non-obvious choice has a record.
- Status: [`docs/STATUS.md`](./STATUS.md), live gates, perf, watch items.

## System shape

Core grammar: `signal -> boundary -> named state -> target output`. `@czap/core` owns the language; host packages rig it to browsers, Astro, edge, workers, video, CLI, and AI-tooling surfaces. Worth noting: the grammar holds across all of them. No host gets to invent its own boundary semantics; every projection target reads the same content-addressed definition.

## Package DAG

```text
@czap/_spine -> @czap/core
@czap/core -> quantizer / compiler / detect / web / worker / remotion / assets / scene
compiler -> vite -> astro
detect -> edge -> astro
web + worker -> astro
scene + assets -> cli -> mcp-server
```

Plus `crates/czap-compute/`, the Rust `#![no_std]` WASM hot-path kernels.

## Packages

| Package | API docs | Owns |
|---|---|---|
| @czap/_spine | [api/@czap/_spine/](./api/@czap/_spine/) | type spine |
| @czap/core | [api/core/](./api/core/) | primitives and runtime coordination |
| @czap/quantizer | [api/quantizer/](./api/quantizer/) | boundary evaluation and transitions |
| @czap/compiler | [api/compiler/](./api/compiler/) | CSS / GLSL / WGSL / ARIA / AI / Tailwind output |
| @czap/web | [api/web/](./api/web/) | DOM, SSE, morph, LLM, capture helpers |
| @czap/detect | [api/detect/](./api/detect/) | capability and tier detection |
| @czap/vite | [api/vite/](./api/vite/) | Vite transforms and HMR |
| @czap/astro | [api/astro/](./api/astro/) | Astro integration and directives |
| @czap/edge | [api/edge/](./api/edge/) | client hints, tiers, edge cache |
| @czap/worker | [api/worker/](./api/worker/) | off-thread compositor / render workers |
| @czap/remotion | [api/remotion/](./api/remotion/) | Remotion adapter |
| @czap/scene | [api/scene/](./api/scene/) | ECS scene composition |
| @czap/assets | [api/assets/](./api/assets/) | asset capsules and projections |
| @czap/cli | [api/cli/](./api/cli/) | JSON-first CLI |
| @czap/mcp-server | [api/mcp-server/](./api/mcp-server/) | MCP server |

For package-by-package import guidance, read [`PACKAGE-SURFACES.md`](./PACKAGE-SURFACES.md).

## Graceful degradation, not silent ceilings

`DirtyFlags` is a 31-key bitmask fast-path; past 31 active quantizers, the compositor falls back to full recompute (`packages/core/src/compositor.ts:145`). Same with `Boundary.evaluate`, which unrolls for ≤4 thresholds and falls back to binary search above that (`packages/core/src/boundary.ts:83`). The pattern repeats: pick the right-shaped optimization for the regime that benefits, fall back honestly when the regime changes. No silent breakage at the edge of the fast path.

## Architectural decisions

See [`docs/adr/README.md`](./adr/README.md) for the full index. Foundational ADRs:

- [0001 — Namespace pattern + branded types](./adr/0001-namespace-pattern.md)
- [0002 — Zero-allocation hot path discipline](./adr/0002-zero-alloc.md)
- [0003 — Content addressing via FNV-1a + CBOR](./adr/0003-content-addressing.md)
- [0004 — Plan IR vs RuntimeCoordinator split](./adr/0004-plan-coordinator.md)
- [0005 — Effect boundary rules](./adr/0005-effect-boundary.md)
- [0006 — Compiler dispatch tagged union](./adr/0006-compiler-dispatch.md)

## Where to start

- New contributors: read the [mental model](./ASTRO-STATIC-MENTAL-MODEL.md), [GLOSSARY](./GLOSSARY.md), [ADR-0001](./adr/0001-namespace-pattern.md), and [ADR-0002](./adr/0002-zero-alloc.md).
- Using primitives: [api/core/](./api/core/) for Boundary, Token, Style, Theme.
- Adding a projection target: [ADR-0006](./adr/0006-compiler-dispatch.md) and `packages/compiler/src/dispatch.ts`.
- Off-thread / WASM: [ADR-0002](./adr/0002-zero-alloc.md), `packages/worker/`, and `crates/czap-compute/`.

## Capsule factory and video stack (2026-04-23)

Full details: [capsule-factory.md](./capsule-factory.md). Factory kernel, scene stack, assets, CLI / MCP, spine bridge.
