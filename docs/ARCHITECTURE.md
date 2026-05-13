# LiteShip architecture

Slim structural index. Deeper explanation lives in the linked docs.

*LiteShip — powered by the CZAP engine (Content-Zoned Adaptive Projection), distributed as `@czap/*` packages on npm.*

Prose vocabulary: [GLOSSARY.md](./GLOSSARY.md).

- Mental model: [`ASTRO-STATIC-MENTAL-MODEL.md`](./ASTRO-STATIC-MENTAL-MODEL.md), [`AUTHORING-MODEL.md`](./AUTHORING-MODEL.md), and [`ASTRO-RUNTIME-MODEL.md`](./ASTRO-RUNTIME-MODEL.md).
- Public surfaces: [`PACKAGE-SURFACES.md`](./PACKAGE-SURFACES.md) and [`docs/api/`](./api/) (TypeDoc-generated from source TSDoc).
- Decisions: [`docs/adr/`](./adr/), where each non-obvious choice has a record.
- Status: [`docs/STATUS.md`](./STATUS.md), live gates, perf, watch items.

## System shape

Core grammar: `signal -> boundary -> named state -> target output`. `@czap/core` owns the language; host packages rig it to browsers, Astro, edge, workers, video, CLI, and AI-tooling surfaces. Worth noting: the grammar holds across all of them. Hosts do not define boundary semantics; every projection target reads the same content-addressed definition.

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

API docs per package live at [`docs/api/<name>/`](./api/); import guidance at [`PACKAGE-SURFACES.md`](./PACKAGE-SURFACES.md).

- `@czap/_spine` — type spine
- `@czap/core` — primitives + runtime coordination
- `@czap/quantizer` — boundary evaluation + transitions
- `@czap/compiler` — CSS / GLSL / WGSL / ARIA / AI / Tailwind output
- `@czap/web` — DOM, SSE, morph, LLM, capture
- `@czap/detect` — capability + tier detection
- `@czap/vite` — Vite transforms + HMR
- `@czap/astro` — Astro integration + directives
- `@czap/edge` — client hints, tiers, edge cache
- `@czap/worker` — off-thread compositor / render workers
- `@czap/remotion` — Remotion adapter
- `@czap/scene` — ECS scene composition
- `@czap/assets` — asset capsules + projections
- `@czap/cli` — JSON-first CLI
- `@czap/mcp-server` — MCP server

## Graceful degradation

Fast paths fall back honestly past their regime — `DirtyFlags` past 31 keys (`packages/core/src/compositor.ts:146`), `Boundary.evaluate` past 4 thresholds (`packages/core/src/boundary.ts:86`).

## Architectural decisions

Full index: [`docs/adr/README.md`](./adr/README.md). Accepted set:

- [0001](./adr/0001-namespace-pattern.md) — Namespace pattern + branded types
- [0002](./adr/0002-zero-alloc.md) — Zero-allocation hot path
- [0003](./adr/0003-content-addressing.md) — Content addressing via FNV-1a + CBOR
- [0004](./adr/0004-plan-coordinator.md) — Plan IR vs RuntimeCoordinator
- [0005](./adr/0005-effect-boundary.md) — Effect boundary rules
- [0006](./adr/0006-compiler-dispatch.md) — Compiler dispatch tagged union
- [0007](./adr/0007-adapter-vs-peer-framing.md) — Adapter vs peer framing
- [0008](./adr/0008-capsule-assembly-catalog.md) — Capsule assembly catalog (7-arm closure)
- [0009](./adr/0009-ecs-scene-composition.md) — ECS as scene composition substrate
- [0010](./adr/0010-spine-canonical-type-source.md) — Spine as canonical type source
- [0011](./adr/0011-ship-capsule.md) — ShipCapsule: content addressing crosses into release artifacts

Capsule factory + video stack: [capsule-factory.md](./capsule-factory.md).

## Where to start

- New contributors: [mental model](./ASTRO-STATIC-MENTAL-MODEL.md), [GLOSSARY](./GLOSSARY.md), [ADR-0001](./adr/0001-namespace-pattern.md), [ADR-0002](./adr/0002-zero-alloc.md).
- Using primitives: [api/core/](./api/core/).
- Adding a projection target: [ADR-0006](./adr/0006-compiler-dispatch.md), `packages/compiler/src/dispatch.ts`.
- Host integration: [HOSTING.md](./HOSTING.md).
