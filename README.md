# czap

[![CI](https://github.com/TheFreeBatteryFactory/czap/actions/workflows/ci.yml/badge.svg)](https://github.com/TheFreeBatteryFactory/czap/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@czap/core.svg)](https://www.npmjs.com/package/@czap/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> Constraint-based adaptive rendering for the web. Quantize continuous signals into discrete states, compile to CSS / GLSL / WGSL / ARIA / AI, run off-thread.

`czap` is a TypeScript-first frontend framework that treats UI state as **boundaries between continuous signals and discrete responses**. Hover position, scroll progress, viewport width, network latency, GPU tier, motion preference — all of these are continuous inputs. Most UI just wants to react to a small set of *states* derived from them. czap formalizes that boundary, compiles it to your output target, and keeps the runtime off the main thread.

It's a real pre-1.0 framework being hardened against dogfooded sites and a CRM UI — not a toy or a research artifact.

## Quick start

```bash
pnpm add @czap/core @czap/quantizer @czap/compiler
```

```ts
import { Boundary, Token, Theme, Style } from '@czap/core';

// Continuous signal → discrete state
const viewport = Boundary.make({
  input: 'viewport.width',
  at: [
    [0, 'mobile'],
    [768, 'tablet'],
    [1280, 'desktop'],
  ] as const,
  hysteresis: 20,
});

// Tokens with axis variants (theme, density, motion tier...)
const primary = Token.make({
  name: 'primary',
  category: 'color',
  axes: ['theme'] as const,
  values: { dark: '#00e5ff', light: 'hsl(175 70% 50%)' },
  fallback: '#00e5ff',
});

// Style that responds to a boundary
const card = Style.make({
  boundary: viewport,
  base: { properties: { padding: '1rem' } },
  states: {
    mobile: { properties: { padding: '0.5rem' } },
    desktop: { properties: { padding: '2rem' } },
  },
});

// Tap into a specific axis instance (for SSR / fallback)
const value = Token.tap(primary, { theme: 'dark' });
const cssVar = Token.cssVar(primary);
```

A full walkthrough — clone → install → run a hello-world boundary that compiles to CSS and hydrates via Astro — lives at [docs/GETTING-STARTED.md](./docs/GETTING-STARTED.md).

## What's in the box

| Package | Description |
| --- | --- |
| [`@czap/_spine`](./packages/_spine) | Type-only declaration spine referenced by published `.d.ts` from `@czap/core` / `@czap/scene` |
| [`@czap/core`](./packages/core) | Primitives: Boundary, Token, Style, Theme, Signal, Compositor, ECS, HLC, DAG, Plan, AVBridge |
| [`@czap/quantizer`](./packages/quantizer) | `Q.from()` builder, boundary evaluation, animated transitions, motion-tier gating |
| [`@czap/compiler`](./packages/compiler) | Multi-target output: CSS, GLSL, WGSL, ARIA, AI, Tailwind v4 |
| [`@czap/web`](./packages/web) | DOM runtime: Morph, SlotRegistry, SSE client, Physical state, LLM adapter, AudioWorklet |
| [`@czap/detect`](./packages/detect) | Device capability probes, GPU tier, design/motion-tier mapping |
| [`@czap/vite`](./packages/vite) | Vite 8 plugin: `@token` / `@theme` / `@style` / `@quantize` CSS transforms + HMR |
| [`@czap/astro`](./packages/astro) | Astro 6 integration: `Satellite` component + `client:satellite` directive |
| [`@czap/edge`](./packages/edge) | CDN-edge: Client Hints, tier detection, KV boundary cache, theme compilation |
| [`@czap/worker`](./packages/worker) | Off-thread: SPSC ring buffer, compositor worker, render worker, OffscreenCanvas |
| [`@czap/remotion`](./packages/remotion) | Remotion adapter: React hooks + composition helpers |
| [`@czap/scene`](./packages/scene) | ECS-backed scene composition + timeline authoring |
| [`@czap/assets`](./packages/assets) | Asset capsules + analysis projections (audio waveform, beat markers, ...) |
| [`@czap/cli`](./packages/cli) | `czap` CLI — AI-first JSON I/O with human-pretty TTY mode |
| [`@czap/mcp-server`](./packages/mcp-server) | Model Context Protocol server for AI tooling integration |

Plus `crates/czap-compute/` — a Rust `#![no_std]` WASM crate (spring, boundary, blend kernels) for the hot-path compute escape hatch.

## Support matrix

- Node.js 22, pnpm 10
- Vite 8, Astro 6
- Windows + Linux, PowerShell + bash
- Chromium + Firefox + WebKit (shared runtime + browser test matrix)
- Chromium-first WebCodecs capture and related browser-specific paths

## Documentation

- **[docs/GETTING-STARTED.md](./docs/GETTING-STARTED.md)** — clone → install → first boundary, end-to-end
- **[docs/DOCS.md](./docs/DOCS.md)** — full documentation map
- **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** — package and system architecture
- **[docs/adr/](./docs/adr)** — architecture decision records (numbered, indexed)
- **[docs/api/](./docs/api)** — generated API reference (typedoc) for every package
- **[CONTRIBUTING.md](./CONTRIBUTING.md)** — dev environment, PR conventions, gauntlet workflow
- **[SECURITY.md](./SECURITY.md)** — vulnerability reporting, supported versions, security posture summary
- **[CHANGELOG.md](./CHANGELOG.md)** — release history
- **[docs/RELEASING.md](./docs/RELEASING.md)** — npm publish, tags, GitHub releases, optional history scrub
- **[docs/HISTORY_SCRUB.md](./docs/HISTORY_SCRUB.md)** — `git filter-repo` discovery checklist before going public

## Security posture (summary)

The runtime is hardened around explicit trust boundaries instead of permissive defaults:

- runtime URLs same-origin by default; cross-origin requires an explicit allowlist policy
- artifact IDs validated as single path segments
- LLM rendering defaults to text-safe; HTML flows route through a shared trust pipeline (`text` / `sanitized-html` / explicit `trusted-html`)
- runtime code avoids `eval` and `new Function`
- Astro integration publishes a frozen `__CZAP_RUNTIME_POLICY__` snapshot for runtime endpoint and HTML trust decisions

Full posture and trust-boundary detail: see [SECURITY.md](./SECURITY.md) and [docs/STATUS.md](./docs/STATUS.md).

## Scope and non-goals

`czap` is intentionally not, in the current wave:

- a built-in auth / session framework
- an ORM / storage / queue stack
- an RPC / server-action mutation layer
- a backend / router framework
- a stateful edge AI runtime substrate

Pre-1.0 break policy is intentionally aggressive. If an API or internal contract is going to be painful later, the preference is to break it now while the framework is still greenfield.

## Working in this repo

```bash
pnpm install
pnpm run build
pnpm run typecheck
pnpm test                 # unit + component + property + integration (~75s)
pnpm run gauntlet:full    # full release-grade gate (~22min)
```

Other lanes — `test:vite`, `test:astro`, `test:tailwind`, `test:e2e`, `test:e2e:stress`, `test:e2e:stream-stress`, `test:redteam`, `package:smoke`, `bench`, `bench:gate`, `bench:reality`, `coverage:merge`, `report:runtime-seams`, `audit`, `report:satellite-scan`, `feedback:verify` — are documented in [CONTRIBUTING.md](./CONTRIBUTING.md).

`pnpm run gauntlet:full` is the one that matters before a release: 30 phases, ~22 minutes, ends with `flex:verify PASSED — project is 10/10 by every rating dimension` or it fails.

## Operational telemetry

For run-by-run truth (current test counts, coverage totals, benchmark posture, watch items, artifact policy) see [docs/STATUS.md](./docs/STATUS.md). Generated artifacts in `coverage/`, `benchmarks/`, and `reports/` are the live source of truth when fresh and `pnpm run feedback:verify` passes.

[`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md), the ADRs, and the package surface docs explain shape and intent — they are not run-by-run ledgers.

## Appendix: Windows / PowerShell log capture

The gauntlet emits UTF-8 (vitest reporter glyphs, JSON receipts). PowerShell's `>` redirect writes UTF-16 LE by default, and viewers using cp437 then mis-render unicode arrows (`↓`, `✓`) as `Γåô` / `Γ£ô` mojibake. To capture clean logs:

```powershell
pnpm run gauntlet:full | Out-File -Encoding utf8 .log
# or set the codepage once per session:
chcp 65001
```

Bash and PowerShell-on-Linux are unaffected.
