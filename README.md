# LiteShip

[![CI](https://github.com/TheFreeBatteryFactory/czap/actions/workflows/ci.yml/badge.svg)](https://github.com/TheFreeBatteryFactory/czap/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@czap/core.svg)](https://www.npmjs.com/package/@czap/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

LiteShip rigs continuous signals into a small set of named bearings and casts each bearing to whatever surface the host runs. Viewport width slides as the user drags. Network latency wobbles. The dark-mode toggle fires at 11pm whether the user clicks it or the OS does it for them. All of that comes in continuous; your UI only needs a few states out: mobile/tablet/desktop, light/dark, reduced/full-motion. The rig is in between.

From one definition, the system can emit a CSS variable, a GLSL preamble, an ARIA attribute on the body, an AI manifest, and a TypeScript union. Same boundary, five surfaces, content-addressed via FNV-1a + canonical CBOR (see [ADR-0003](./docs/adr/0003-content-addressing.md)). No silent drift between projection layers.

*LiteShip — powered by the CZAP engine (Content-Zoned Adaptive Projection, "see-zap"), distributed as `@czap/*` packages on npm.*

This is a real pre-1.0 hull being hardened on dogfooded sites and a CRM UI. Naming vocabulary across every doc lives in [docs/GLOSSARY.md](./docs/GLOSSARY.md).

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

A full walkthrough (clone, install, rig a hello-world boundary, cast to CSS, hydrate through Astro) lives at [docs/GETTING-STARTED.md](./docs/GETTING-STARTED.md). For the shape of day-to-day authoring (what you actually type, what comes out, how the rest of the pipeline reads it), [docs/AUTHORING-MODEL.md](./docs/AUTHORING-MODEL.md) opens with a one-paragraph "what it feels like to author" before the reference.

## What you can stop hand-rolling

The pattern LiteShip absorbs is the one most projects re-implement, in pieces, by hand:

- the breakpoint table for layout (CSS media queries)
- the theme switcher for colors (CSS variable rebinding plus a JS toggle)
- the ARIA attribute that mirrors the layout state (separate hand-write, easy to forget)
- the GLSL uniform that mirrors the same state on hosts that ship a shader
- the TypeScript discriminated union that lets the rest of your app `switch` on the same state

Hand-rolled, those drift the moment one of them falls behind. Authored as a single boundary, they emit from one definition every time. The boundary is content-addressed (FNV-1a + canonical CBOR per [ADR-0003](./docs/adr/0003-content-addressing.md)); change the definition, every output recomputes against the same hash.

This is not a replacement for media queries (use them where they're enough), CSS custom properties (use them where you control the keyspace), or design-token systems (LiteShip *is* one, and also the projection layer above them). It's the rig that ties them together so they stay in agreement.

## What's in the box

The packages you install in the Quick Start above are the smallest useful set for authoring + casting end-to-end. The Quick Start snippet imports from `@czap/core`; you reach for `@czap/quantizer` to evaluate boundaries against live signals (`Q.from()`) and `@czap/compiler` to cast a boundary to a target output (`CSSCompiler.compile()` and friends).

| Package | Description |
| --- | --- |
| [`@czap/core`](./packages/core) | Primitives: Boundary, Token, Style, Theme, Signal, Compositor, ECS, HLC, DAG, Plan, AVBridge |
| [`@czap/quantizer`](./packages/quantizer) | `Q.from()` builder, boundary evaluation, animated transitions, motion-tier gating |
| [`@czap/compiler`](./packages/compiler) | Multi-target output: CSS, GLSL, WGSL, ARIA, AI, Tailwind v4 |

Add a host integration when you wire LiteShip into a build pipeline:

| Package | Description |
| --- | --- |
| [`@czap/vite`](./packages/vite) | Vite 8 plugin: `@token` / `@theme` / `@style` / `@quantize` CSS transforms + HMR |
| [`@czap/astro`](./packages/astro) | Astro 6 integration: `Satellite` component + `client:satellite` directive |
| [`@czap/edge`](./packages/edge) | CDN-edge: Client Hints, tier detection, KV boundary cache, theme compilation |

Reach for the rest only when the surface meaning justifies the runtime escalation:

| Package | Description |
| --- | --- |
| [`@czap/web`](./packages/web) | DOM runtime: Morph, SlotRegistry, SSE client, Physical state, LLM adapter, AudioWorklet |
| [`@czap/detect`](./packages/detect) | Device capability probes, GPU tier, design/motion-tier mapping |
| [`@czap/worker`](./packages/worker) | Off-thread: SPSC ring buffer, compositor worker, render worker, OffscreenCanvas |
| [`@czap/remotion`](./packages/remotion) | Remotion adapter: React hooks + composition helpers |
| [`@czap/scene`](./packages/scene) | ECS-backed scene composition + timeline authoring |
| [`@czap/assets`](./packages/assets) | Asset capsules + analysis projections (audio waveform, beat markers, ...) |
| [`@czap/cli`](./packages/cli) | `czap` CLI: AI-first JSON I/O with human-pretty TTY mode |
| [`@czap/mcp-server`](./packages/mcp-server) | Model Context Protocol server for AI tooling integration |
| [`@czap/_spine`](./packages/_spine) | Type-only declaration spine referenced by published `.d.ts` from `@czap/core` / `@czap/scene` |

Plus `crates/czap-compute/`: a Rust `#![no_std]` WASM crate (spring, boundary, blend kernels) for the working-line compute escape hatch.

## Frameworks and stacks

LiteShip's primary host integration is Astro 6 (`@czap/astro`). The core authoring layer (`@czap/core`, `@czap/quantizer`, `@czap/compiler`) is framework-portable: it produces CSS strings, GLSL preambles, ARIA records, and TypeScript unions from boundary definitions, and any framework can spread those onto its own elements. `@czap/vite` plugs the same `@token` / `@theme` / `@style` / `@quantize` CSS transforms into any Vite-based stack (React, Solid, Svelte, Vue, vanilla). The Astro-specific surfaces (the `Satellite` component, `client:satellite` directive, `czapMiddleware`) are additive — you don't need them to use the authoring + casting layer.

Mobile and PWA: viewport, motion-preference, GPU tier, and network-condition signals all flow through the same boundary primitive. The framework is presentation-focused and doesn't ship offline-first / service-worker / manifest tooling; pair LiteShip with whatever PWA stack your host already uses.

## Migration posture

LiteShip is greenfield-first. There is no migration guide for porting an existing React + Tailwind + CSS Modules site, and no automated import path for existing design-token JSON. The right adoption shape is per-surface: pick one section, author it the LiteShip way (signal → boundary → states → styles → compiled output), let media queries and CSS custom properties keep working everywhere else. The framework's "this is not a replacement for media queries" clause means co-existence is the supported model: LiteShip emits `data-czap-state`-keyed selectors that stack alongside existing rules; conflicts resolve via normal CSS specificity. `TokenTailwindCompiler` produces Tailwind v4 token files from LiteShip definitions (one direction); ingesting an existing Tailwind config back into LiteShip is not currently tooled.

## Support matrix

| Dimension | Tier-1 (CI-gated) | Tier-2 (best-effort) |
| --- | --- | --- |
| OS | Windows + Linux | macOS |
| Shell | PowerShell + bash | zsh / bash on macOS |
| Node.js | 22, pnpm 10 | same — no known gap |
| Vite / Astro | 8 / 6 | same — no known gap |
| Browsers | Chromium + Firefox + WebKit | same — no known gap |

**Windows + Linux are tier-1.** Every push and pull request runs the full `gauntlet:full` on Linux (`truth-linux`) and a broad smoke sweep on Windows (`windows-smoke`) via `.github/workflows/ci.yml`. Automated regression catches OS-specific drift before merge. WebCodecs capture and related browser-specific paths are Chromium-first.

**macOS is tier-2.** macOS is POSIX, ships Node 22, and Playwright supports it, so the toolchain probably works. It is not CI-gated; no runner in the workflow is `macos-*`. Known areas where macOS may differ from the tested paths:

- **Playwright browser-dep install** — the workflow uses `apt-get` on Linux and Playwright's own install step on Windows; on macOS the equivalent is Homebrew or a manual Playwright dep path.
- **Vite filesystem watchers** — chokidar takes different code paths on APFS (FSEvents) vs ext4 / NTFS. HMR watch behavior under `@czap/vite` may differ.
- **Bench-gate distributions on Apple Silicon** — worker startup is faster than the Linux baseline some bench pairs are calibrated against. Hard gates should still pass; the numeric distributions will look different.

Contributors are welcome to file macOS-specific issues; the project will accept patches that don't break the tier-1 paths. macOS will not be promoted to tier-1 until a `macos-*` runner is in `.github/workflows/ci.yml`.

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
- The runtime carries no `eval` and no `new Function`. Untrusted text never becomes executable JavaScript at runtime. (WASM bytecode does run at runtime, sandboxed by the host's WASM runtime; see `packages/core/src/wasm-fallback.ts` for the no-WASM path.)
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

`pnpm run gauntlet:full` is the full shake-down cruise before a release. Thirty phases, fifteen to twenty-two minutes end-to-end depending on cold caches and machine speed (recent local: 14m47s on Cursor Cloud Linux). It ends with `flex:verify PASSED — project is 10/10 by every rating dimension`, or it fails and the vessel returns to dry-dock.

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

Diagnostic watch, not a release gate: `llm-runtime-steady` remains above its relative baseline (63.09% median overhead, p99 ratio 1.5233x), but the absolute directive p99 is 23,334.43ns against a 1,000,000ns steady-state budget. That's ~2.3% of the budget: headroom, not panic. Current artifact truth lives in `benchmarks/directive-gate.json`, `reports/runtime-seams.json`, and `reports/satellite-scan.json`.

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
