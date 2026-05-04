# czap

Constraint-based adaptive rendering framework. Quantize continuous signals into discrete states, compile them to CSS/GLSL/WGSL/ARIA/AI outputs, detect device capabilities, serve through Vite 8, and hydrate through Astro 6.

`czap` is being hardened as a real pre-1.0 frontend framework for dogfooded websites and a CRM UI, not just as a locally coherent monorepo.

## Operational Truth

- [`docs/STATUS.md`](./docs/STATUS.md) is the live operational ledger for counts, gates, coverage totals, benchmark posture, and current watch items.
- Generated artifacts in `coverage/`, `benchmarks/`, and `reports/` are the live telemetry source of truth when they are fresh and `pnpm run feedback:verify` passes.
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) and the other conceptual docs explain system shape and intent, but they are not run-by-run telemetry ledgers.

## Support Matrix

Current first-class support target:

- Node.js 22
- pnpm 10
- Vite 8
- Astro 6
- Windows + Linux
- PowerShell + bash
- Chromium + Firefox + WebKit for the shared runtime/browser matrix
- Chromium-first capability coverage for WebCodecs capture and related browser-specific paths

### PowerShell note: capturing gauntlet logs in UTF-8

The gauntlet emits UTF-8 (vitest reporter glyphs, JSON receipts). PowerShell's
`>` redirect writes UTF-16 LE by default and many viewers/grep tools then
mis-render the unicode arrows (`↓`, `✓`) as `Γåô` / `Γ£ô` mojibake. Use
`Out-File -Encoding utf8` (or run `chcp 65001` first) to capture clean logs:

```powershell
pnpm run gauntlet:full | Out-File -Encoding utf8 .log
```

Bash and PowerShell-on-Linux are unaffected.

## Security Defaults

The runtime is now hardened around explicit trust boundaries instead of permissive defaults:

- runtime URLs are same-origin by default
- cross-origin runtime URLs require an explicit allowlist policy
- artifact IDs are validated as single path segments
- LLM rendering defaults to text-safe behavior
- stream and LLM HTML flows route through a shared trust pipeline with `text`, `sanitized-html`, and explicit `trusted-html` modes
- morph HTML parsing strips executable markup classes
- boundary state application defaults to `--czap-*`, `aria-*`, and `role`
- theme compilation rejects unsafe prefixes and CSS-breaking token values
- receipt-chain runtime handling is advisory unless verification is explicitly added at the host layer
- the bootstrap `__CZAP_DETECT__` snapshot is non-enumerable, frozen, and intentionally minimal
- Astro integration publishes a frozen `__CZAP_RUNTIME_POLICY__` snapshot for runtime endpoint and HTML trust decisions

See [`docs/STATUS.md`](./docs/STATUS.md) for the current trust-boundary posture and active watch items.

## CSP and Trusted Types

Current browser-security posture:

- runtime code avoids `eval` and `new Function`
- HTML rendering defaults to text-safe behavior, and the remaining trusted HTML path is centralized behind the shared morph/LLM trust gate
- Astro integration still injects bootstrap scripts, so a strict `Content-Security-Policy` requires hashes or nonces at the host layer
- `czap` does not auto-install a Trusted Types policy for the app; host apps that enforce Trusted Types should keep routing future HTML sinks through the shared runtime trust surfaces instead of ad hoc DOM writes

## Scope and Non-Goals

`czap` is intentionally not, in the current wave:

- a built-in auth/session framework
- an ORM/storage/queue stack
- an RPC/server-action mutation layer
- a backend/router framework
- a stateful edge AI runtime substrate

Pre-1.0 break policy is intentionally aggressive. If an API or internal contract is going to be painful later, the preference is to break it now while the framework is still greenfield.

## Repo Layout

```text
czap/
  packages/
    core/           @czap/core -- primitives and runtime coordination
    quantizer/      @czap/quantizer -- boundary evaluation and animated transitions
    compiler/       @czap/compiler -- multi-target output
    web/            @czap/web -- DOM runtime
    detect/         @czap/detect -- capability probes
    vite/           @czap/vite -- Vite 8 plugin
    astro/          @czap/astro -- Astro 6 integration
    edge/           @czap/edge -- CDN-edge host path
    worker/         @czap/worker -- off-main-thread compositor and render workers
    remotion/       @czap/remotion -- Remotion adapter
    _spine/         type-level spine (no runtime)
  tests/
    unit/           Vitest node lane
    browser/        Vitest browser lane
    integration/    cross-package integration tests
    e2e/            Playwright end-to-end and stress lanes
    regression/     dedicated red-team regression lane
  scripts/          test, benchmark, audit, and artifact tooling
  docs/             architecture, runtime, package surfaces, status
```

## Install

```bash
pnpm install
```

## Quick Start

```ts
import { Boundary, Token, Theme, Style, Component } from '@czap/core';

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

const brand = Theme.make({
  name: 'brand',
  variants: ['light', 'dark'] as const,
  tokens: { primary: { light: 'hsl(175 70% 50%)', dark: '#00e5ff' } },
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
const prop = Token.cssVar(primary);
```

## Commands

Fast local loop:

```bash
pnpm install
pnpm run build
pnpm run typecheck
pnpm test
```

Integration and browser lanes:

```bash
pnpm run test:vite
pnpm run test:astro
pnpm run test:tailwind
pnpm run test:e2e
pnpm run test:e2e:stress
pnpm run test:e2e:stream-stress
pnpm run test:redteam
```

Truth-chain and release-readiness lanes:

```bash
pnpm run package:smoke
pnpm run bench
pnpm run bench:gate
pnpm run bench:reality
pnpm run coverage:merge
pnpm run report:runtime-seams
pnpm run audit
pnpm run report:satellite-scan
pnpm run feedback:verify
pnpm run gauntlet:full
```

## Packaging and Publish Readiness

All `@czap/*` packages are treated as real distribution artifacts now, not throwaway workspace internals:

- build emits package `dist/` outputs
- `package:smoke` packs every publishable package
- tarballs are installed into a disposable consumer
- export maps and type entrypoints are verified from packed artifacts

Current policy:

- packages are publish-shaped and tarball-smoke-tested
- the repo still dogfoods them through workspace links until the first external npm release is intentionally cut
- README examples describe the public surface, but the monorepo remains the canonical consumption path today

## Documentation

- [docs/DOCS.md](./docs/DOCS.md) -- documentation map
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) -- package and system architecture
- [docs/adr/0002-zero-alloc.md](./docs/adr/0002-zero-alloc.md) -- zero-allocation hot path discipline
- [docs/adr/0004-plan-coordinator.md](./docs/adr/0004-plan-coordinator.md) -- Plan IR vs RuntimeCoordinator (per-tick phase sequencing)
- [docs/ASTRO-STATIC-MENTAL-MODEL.md](./docs/ASTRO-STATIC-MENTAL-MODEL.md) -- Astro static-site model
- [docs/AUTHORING-MODEL.md](./docs/AUTHORING-MODEL.md) -- authoring mechanics
- [docs/ASTRO-RUNTIME-MODEL.md](./docs/ASTRO-RUNTIME-MODEL.md) -- Astro host/runtime model
- [docs/PACKAGE-SURFACES.md](./docs/PACKAGE-SURFACES.md) -- public package surface map
- [docs/STATUS.md](./docs/STATUS.md) -- current repo truth, gates, watch items, and artifact policy
