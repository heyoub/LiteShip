# LiteShip

[![CI](https://github.com/TheFreeBatteryFactory/czap/actions/workflows/ci.yml/badge.svg)](https://github.com/TheFreeBatteryFactory/czap/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@czap/core.svg)](https://www.npmjs.com/package/@czap/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

LiteShip rigs continuous signals into a small set of named bearings and casts each bearing to whatever surface the host runs. Viewport width slides as the user drags. Network latency wobbles. The dark-mode toggle fires at 11pm whether the user clicks it or the OS does it for them. All of that comes in continuous; your UI only really needs a few states out: mobile/tablet/desktop, light/dark, reduced/full-motion. The rig is in between.

From one definition, the system can emit a CSS variable, a GLSL preamble, an ARIA attribute on the body, an AI manifest, and a TypeScript union. Same boundary, five surfaces, content-addressed via FNV-1a + canonical CBOR (see [ADR-0003](./docs/adr/0003-content-addressing.md)). No silent drift between projection layers.

*LiteShip — powered by the CZAP engine (Content-Zoned Adaptive Projection, "see-zap"), distributed as `@czap/*` packages on npm.*

This is a real pre-1.0 hull being hardened on dogfooded sites and a CRM UI, not a toy or a research artifact. Naming vocabulary across every doc lives in [docs/GLOSSARY.md](./docs/GLOSSARY.md).

## Quick start

```bash
pnpm add @czap/core @czap/quantizer @czap/compiler
```

```ts
import { Boundary, Token, Style } from '@czap/core';

const viewport = Boundary.make({
  input: 'viewport.width',
  at: [
    [0, 'mobile'],
    [768, 'tablet'],
    [1280, 'desktop'],
  ] as const,
  hysteresis: 20,
});

const primary = Token.make({
  name: 'primary',
  category: 'color',
  axes: ['theme'] as const,
  values: { dark: '#00e5ff', light: 'hsl(175 70% 50%)' },
  fallback: '#00e5ff',
});

const card = Style.make({
  boundary: viewport,
  base: { properties: { padding: '1rem' } },
  states: {
    mobile: { properties: { padding: '0.5rem' } },
    desktop: { properties: { padding: '2rem' } },
  },
});

const value = Token.tap(primary, { theme: 'dark' });
const cssVar = Token.cssVar(primary);
```

The `hysteresis: 20` in there is a half-width dead-zone, by the way. Cross a threshold and you stay across until the signal moves past the next half-tick. No flicker at 768.0001px when the user is dragging the window edge.

A full walkthrough (clone, install, rig a hello-world boundary, cast to CSS, hydrate through Astro) lives at [docs/GETTING-STARTED.md](./docs/GETTING-STARTED.md).

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
| [`@czap/cli`](./packages/cli) | `czap` CLI: AI-first JSON I/O with human-pretty TTY mode |
| [`@czap/mcp-server`](./packages/mcp-server) | Model Context Protocol server for AI tooling integration |

Plus `crates/czap-compute/`: a Rust `#![no_std]` WASM crate (spring, boundary, blend kernels) for the working-line compute escape hatch.

## Support matrix

- Node.js 22, pnpm 10
- Vite 8, Astro 6
- Windows + Linux, PowerShell + bash
- Chromium + Firefox + WebKit (shared runtime + browser test matrix)
- Chromium-first WebCodecs capture and related browser-specific paths

## Documentation

- [docs/GETTING-STARTED.md](./docs/GETTING-STARTED.md): clone, install, first boundary, end-to-end
- [docs/ASTRO-STATIC-MENTAL-MODEL.md](./docs/ASTRO-STATIC-MENTAL-MODEL.md): signals to boundaries to named states to outputs, the theory-first authoring frame
- [docs/AUTHORING-MODEL.md](./docs/AUTHORING-MODEL.md): definition shapes, naming, and composition rules
- [docs/ASTRO-RUNTIME-MODEL.md](./docs/ASTRO-RUNTIME-MODEL.md): how Astro hosts the runtime, directives, and the escalation path
- [docs/PACKAGE-SURFACES.md](./docs/PACKAGE-SURFACES.md): package-by-package import and ownership map
- [docs/DOCS.md](./docs/DOCS.md): full documentation map
- [docs/GLOSSARY.md](./docs/GLOSSARY.md): LiteShip / CZAP / `@czap/*` naming and prose register
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md): package and system architecture
- [docs/adr/](./docs/adr): architecture decision records, numbered and indexed
- [docs/api/](./docs/api): generated API reference (typedoc) for every package; intro text in [docs/TYPEDOC_README.md](./docs/TYPEDOC_README.md)
- [CONTRIBUTING.md](./CONTRIBUTING.md): dev environment, PR conventions, gauntlet workflow
- [SECURITY.md](./SECURITY.md): vulnerability reporting, supported versions, security posture summary
- [CHANGELOG.md](./CHANGELOG.md): release history
- [docs/RELEASING.md](./docs/RELEASING.md): npm publish, tags, GitHub releases, optional history scrub
- [docs/HISTORY_SCRUB.md](./docs/HISTORY_SCRUB.md): `git filter-repo` discovery checklist before going public

## Security posture (summary)

Trust is set explicitly, not by permission default.

- Runtime endpoints stay same-origin unless you set an allowlist for cross-origin paths.
- Artifact IDs are validated as single path segments. No smuggled traversal.
- LLM rendering defaults to text-safe; HTML flows route through the shared trust pipeline (`text` / `sanitized-html` / explicit `trusted-html`).
- The runtime carries no `eval` and no `new Function`. Code that arrives mid-voyage doesn't run.
- The Astro integration publishes a frozen `__CZAP_RUNTIME_POLICY__` snapshot for runtime endpoint and HTML trust decisions.

Full posture and trust-boundary detail in [SECURITY.md](./SECURITY.md) and [docs/STATUS.md](./docs/STATUS.md).

## Scope and non-goals

LiteShip is intentionally not, in the current wave:

- a built-in auth / session stack
- an ORM / storage / queue stack
- an RPC / server-action mutation layer
- a backend / router stack
- a stateful edge AI runtime substrate

Pre-1.0 break policy is aggressive on purpose. If an API or internal contract is going to be painful later, the preference is to break it now while the hull is still in greenfield fit-out.

## Working in this repo

```bash
pnpm install
pnpm run build
pnpm run typecheck
pnpm test                 # unit + component + property + integration (~75s)
pnpm run gauntlet:full    # full release-grade gate (~22min)
```

Other lanes (`test:vite`, `test:astro`, `test:tailwind`, `test:e2e`, `test:e2e:stress`, `test:e2e:stream-stress`, `test:redteam`, `package:smoke`, `bench`, `bench:gate`, `bench:reality`, `coverage:merge`, `report:runtime-seams`, `audit`, `report:satellite-scan`, `feedback:verify`) are documented in [CONTRIBUTING.md](./CONTRIBUTING.md).

`pnpm run gauntlet:full` is the full shake-down cruise before a release. Thirty phases, fifteen to twenty-two minutes from first cast-off to final receipt depending on cold caches and machine speed (recent local: 14m47s on Cursor Cloud Linux). It ends with `flex:verify PASSED — project is 10/10 by every rating dimension`, or it fails and the vessel returns to dry-dock.

## Latest gauntlet benchmark snapshot

Fresh local run on 2026-05-09 (Cursor Cloud Linux, Node 22, pnpm 10):

- `pnpm run gauntlet:full` passed end-to-end in 14m47s.
- `flex:verify` passed: `project is 10/10 by every rating dimension`.
- `bench:gate` passed: 7 hard gates, 0 failed, 5 replicates.
- `package:smoke` passed for all 15 publishable `@czap/*` scopes.

| Hard-gated pair | Median directive | Median baseline | Median overhead | Threshold |
| --- | ---: | ---: | ---: | ---: |
| `satellite` hot path | 1,034.88ns | 968.58ns | 6.88% | 15% |
| `stream` parse + patch | 954,460.54ns | 939,129.93ns | 1.73% | 15% |
| `llm` text chunk parse | 1,018,844.57ns | 918,664.88ns | 10.90% | 15% |
| `worker` fallback eval | 1,588.24ns | 1,483.02ns | 7.03% | 15% |
| `llm-startup-shared` | 98,504.37ns | 96,642.77ns | 1.63% | 25% |
| `llm-promoted-startup-shared` | 150,845.57ns | 150,954.45ns | 0.89% | 25% |
| `worker-runtime-startup-shared` | 1,777.50ns | 4,502.50ns | -65.91% | 25% |

Diagnostic watch, not a release gate: `llm-runtime-steady` remains above its relative baseline (63.09% median overhead, p99 ratio 1.5233x), but the absolute directive p99 is 23,334.43ns against a 1,000,000ns steady-state budget. About 2.3% of the budget, by the way: headroom, not panic. Current artifact truth lives in `benchmarks/directive-gate.json`, `reports/runtime-seams.json`, and `reports/satellite-scan.json`.

## Operational telemetry

For run-by-run truth (current test counts, coverage totals, benchmark posture, watch items, artifact policy) read [docs/STATUS.md](./docs/STATUS.md). Generated artifacts in `coverage/`, `benchmarks/`, and `reports/` are the live source of truth when they're fresh and `pnpm run feedback:verify` passes.

[`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md), the ADRs, and the package surface docs explain shape and intent. They are not run-by-run ledgers.

## Appendix: Windows / PowerShell log capture

The gauntlet emits UTF-8 (vitest reporter glyphs, JSON receipts). PowerShell's `>` redirect writes UTF-16 LE by default, and viewers using cp437 then mis-render unicode arrows (`↓`, `✓`) as `Γåô` / `Γ£ô` mojibake against the repo's UTF-8 stream. To capture clean logs:

```powershell
pnpm run gauntlet:full | Out-File -Encoding utf8 .log
# or set the codepage once per session:
chcp 65001
```

Bash and PowerShell-on-Linux are unaffected.
