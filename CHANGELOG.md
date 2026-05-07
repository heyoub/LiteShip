# Changelog

All notable changes to czap. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Pre-1.0
break policy is intentionally aggressive — minor version bumps may carry breaking changes.

## [0.1.0] — 2026-05-07 (initial public release)

First public release on npm and GitHub. Pre-release entries below this section
chronicle internal development milestones from before the framework went public;
the 14 packages all land on npm at `0.1.0` regardless of their internal history.

### Public-API surface
- Test-only helpers moved off main entries to dedicated `/testing` sub-paths.
  Consumers must now `import { resetCapsuleCatalog } from '@czap/core/testing'`,
  `import { resetAssetRegistry } from '@czap/assets/testing'`, and
  `import { TIER_TARGETS, MemoCache } from '@czap/quantizer/testing'` — these
  functions mutate global registry state and don't belong in production code.
- `Harness` namespace removed from `@czap/core` main entry. Use
  `import * as Harness from '@czap/core/harness'` to get the code-generation
  template surface (fast-check + generators) without bundling it into every
  consumer.
- `startDevServer` moved from `@czap/scene` to `@czap/scene/dev`. The dev
  server pulls `node:os` / `node:crypto` / `vite-server` and would crash
  bundlers targeting browsers / Workers / Deno at parse time if shipped on
  the main entry.
- `@czap/_spine` is now publishable — required so consumers' `tsc` can
  resolve the type spine that `@czap/core` and `@czap/scene` reference in
  their `.d.ts` output.
- Removed orphan re-exports: `SchemaError`/`isSchemaError` from `@czap/core`
  (no in-repo consumers; import from `effect/Schema` directly), `KIND_META`
  from `@czap/vite` (internal lookup table that powers `resolvePrimitive`).

### Package metadata
- All 14 packages now have `keywords`, full `repository`/`bugs`/`homepage`
  fields, `sideEffects: false` (or a precise array for `@czap/web`'s
  capture init), and `license: MIT`.
- `effect` peer-dep ranges relaxed from exact `4.0.0-beta.32` pin to
  `>=4.0.0-beta.0` across `@czap/scene`, `@czap/assets`, `@czap/cli`.
- `effect` removed from `dependencies` in `@czap/core`, `@czap/quantizer`,
  `@czap/detect`, `@czap/web` (was double-listed; consumers no longer pay
  double bundle weight).

### Documentation
- README restructured for OSS first impressions: hook → quick start →
  package table → docs index. Internal hygiene (operational telemetry,
  PowerShell mojibake note) moved to appendix.
- New: [CONTRIBUTING.md](./CONTRIBUTING.md), [SECURITY.md](./SECURITY.md),
  [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md),
  [docs/GETTING-STARTED.md](./docs/GETTING-STARTED.md).
- `docs/api/` (TypeDoc output) regenerated to reflect the post-cleanup
  public surface.

### Hygiene
- Removed ~700KB of internal AI-session plans and Six Sigma debug threads
  from `docs/superpowers/` and `docs/sixsigma/` — kept locally as private
  notes via `.gitignore`.
- Removed root-level scratch files (`PLAN.md`, `QA-AUDIT.md`).
- Untracked stale build artifacts (`scripts/test-*.{js,d.ts}`,
  `tests/integration/astro/.astro/*.d.ts`, `.claude/settings.local.json`,
  `czap.code-workspace`).
- Sanitized hardcoded `c:\Users\<username>\…` paths from `AGENTS.md` and the
  spawn-quoting test fixture.

---

## [0.4.0] — 2026-04-05

### Core

- MotionTier canonical definition moved to @czap/core (was duplicated in detect, quantizer, core)
- Deprecated standalone exports removed: `evaluateBoundary`, `evaluateWithHysteresis` (use `Boundary.evaluate`, `Boundary.evaluateWithHysteresis`)
- New centralized constants: THEME_TRANSITION_DURATION_MS, THEME_TRANSITION_EASING, CANVAS_FALLBACK_WIDTH, CANVAS_FALLBACK_HEIGHT
- MS_PER_SEC used consistently (replaced raw `1000` literals in frame-budget, compositor-worker)
- BoundarySpec.isActive documented as Phase 2 (implemented, not yet wired into Compositor)

### Compiler

- ARIA compiler emits Diagnostics.warn on dropped invalid keys (was silent)
- Theme CSS compiler uses centralized transition constants from defaults.ts

### Quantizer

- TIER_TARGETS now a public export
- MotionTier re-exported from @czap/core

### Web

- SlotRegistry uses SlotAddressing.isValid() for path validation with Diagnostics.warn

### Astro

- Fixed czap:dispose resource leak: now dispatched before czap:reinit on page swap
- SSE reconnect config imports from @czap/core defaults (was hardcoded duplicate)
- Canvas fallback dimensions use centralized constants
- Added "types" field to all 6 client-directive package.json exports

### Edge

- Added effect peer dependency

### Type Contracts (_spine)

- Removed deprecated type aliases from all 5 spine files
- Added MotionTier, SpringConfig, TIER_TARGETS, QuantizerFromOptions to quantizer spine

## [0.3.0] — 2026-03-16

### Core

- FrameCapture: capture abstraction (init/capture/finalize lifecycle)
- CaptureConfig, CaptureFrame, CaptureResult types

### Web

- WebCodecs capture: browser-native H.264 encoding to MP4
- renderToCanvas: CompositeState → OffscreenCanvas
- captureVideo: end-to-end pipeline (VideoRenderer → FrameCapture → CaptureResult)

### Remotion

- @czap/remotion package: React adapter for Remotion video rendering
- useCompositeState: frame-indexed state hook
- cssVarsFromState: CompositeState → CSS custom properties
- FxProvider + useFxState: React context for frame data
- precomputeFrames: async frame precomputation

### Benchmarks

- tinybench harness: core, compiler, video benchmarks
- `bun run bench` script

## [0.2.0] — 2026-03-16

### Core

- FrameScheduler: clock abstraction (rAF, noop, fixed-step)
- Timeline: accepts optional scheduler for deterministic playback
- animate(): accepts optional scheduler for deterministic animation streams
- Signal: implemented scheduled mode for externally-controlled time
- createControllableSignal: seekable signal for video rendering
- VideoRenderer: fixed-step frame generator with CompositeState per frame

### Documentation

- ARCHITECTURE.md: full system overview
- CHANGELOG.md: version history
- README.md: installation, quick start, package table

## [0.1.0] — 2026-03-16

### Core

- BoundaryDef, evaluateBoundary, evaluateWithHysteresis
- Signal, Cell, Derived, FxEvent, Store, FxStream, FxTask
- Timeline (play/pause/seek/scrub/reverse)
- Compositor (multi-quantizer state merge → css/glsl/aria channels)
- BlendTree (weight-based numeric interpolation)
- FrameBudget, DirtyFlags
- ECS (Entity/Component/System/World)
- HLC, VectorClock, Receipt chain, DAG
- Plan IR (step/edge/validation/topological sort)
- Schema codec (Effect Schema)
- LiveCell (protocol envelope + reactive bridge)
- CapSet lattice (static/styled/reactive/animated/gpu)
- TypedRef (content addressing via SHA-256)
- Easing: linear, cubic, expo, back, elastic, bounce, cubicBezier, spring
- springToLinearCSS, springNaturalDuration (CSS linear() from spring physics)

### Design Layer

- TokenDef: multi-axis design tokens with category/axes/values/fallback
- StyleDef: boundary-aware style layers with pseudo/shadow/transition
- ThemeDef: variant-keyed token value maps with light/dark mode metadata
- ComponentDef: satellite shell binding boundary + styles + named slots
- TokenRef brand type

### Compiler

- CSSCompiler: BoundaryDef → @container queries
- GLSLCompiler: BoundaryDef → uniform declarations + bind code
- WGSLCompiler: BoundaryDef → struct definitions + bindings
- ARIACompiler: BoundaryDef → accessibility attribute maps
- AIManifestCompiler: AI tool definitions + JSON schema + system prompts
- TokenCSSCompiler: @property + :root + html[data-theme] overrides
- TokenTailwindCompiler: Tailwind v4 @theme {} blocks
- TokenJSCompiler: const exports + .d.ts type declarations
- ThemeCSSCompiler: html[data-theme] selectors + transition declarations
- StyleCSSCompiler: @layer + @scope + @starting-style + @container delegation
- ComponentCSSCompiler: satellite container + slot marker styling
- generatePropertyRegistrations: @property from state value inference

### Detect

- 16 device capability probes (GPU, cores, memory, WebGPU, touch, reduced-motion, color-scheme, viewport, DPR, connection, contrast, forced-colors, reduced-transparency, dynamic-range, color-gamut, update-rate)
- tierFromCapabilities → CapLevel (single-axis)
- designTierFromCapabilities → DesignTier (2-axis: what to render)
- motionTierFromCapabilities → MotionTier (2-axis: how to move)

### Vite

- @quantize CSS block transform → @container queries
- @token CSS block transform → @property + custom properties
- @theme CSS block transform → html[data-theme] selectors
- @style CSS block transform → @layer + @scope
- Convention-based definition resolution (_.tokens.ts, _.themes.ts, etc.)
- Virtual modules (virtual:fx/tokens, virtual:fx/tokens.css, virtual:fx/boundaries, virtual:fx/themes)
- Vite 8 hotUpdate hook (migrated from deprecated handleHotUpdate)

### Astro

- Satellite.ts: server-side attribute generation for adaptive container divs
- client:satellite directive: client-side signal evaluation + state hydration
- View transition re-initialization (astro:after-swap)

### Type Spine (\_spine/)

- Complete .d.ts contracts for all packages
- design.d.ts: TokenDef, StyleDef, ThemeDef, ComponentDef, utility types
- compiler.d.ts § 7: DefKind, ExtendedCompilerTarget, result types
- detect.d.ts § 3: DesignTier, MotionTier, ExtendedDeviceCapabilities
