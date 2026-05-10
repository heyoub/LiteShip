## [0.1.0] — 2026-05-07 (initial public release)

First public release on npm and GitHub. Pre-release entries below this section
chronicle internal development milestones from before the framework went public;
all **15** `@czap/*` packages (including type-only `@czap/_spine`) land on npm at
`0.1.0` regardless of their internal history.

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
- All 15 packages now have `keywords`, full `repository`/`bugs`/`homepage`
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
- Sanitized hardcoded Windows `C:\Users\<username>\…` paths from `AGENTS.md`
  and the spawn-quoting test fixture.

---
