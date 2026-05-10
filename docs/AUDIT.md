# LiteShip audit loop

The monorepo ships a native audit lane that extends the existing build, typecheck,
coverage, benchmark, and runtime-seam feedback loops.

This audit is advisory-first in the first wave. It is designed to surface structural
drift and hollow-path smells without immediately turning every new rule into a hard
CI failure.

## Commands

- `pnpm run audit` -> full combined audit report
- `pnpm run audit:structure` -> package topology, exports, import graph, orphan candidates
- `pnpm run audit:integrity` -> runtime hollow-path smells in package source
- `pnpm run audit:surface` -> package export surface, Astro runtime/directive surface, Vite virtual modules
- `pnpm run audit:report` -> writes the combined report artifacts

## Artifacts

- JSON: `reports/codebase-audit.json`
- Markdown: `reports/codebase-audit.md`
- JSON: `reports/full-tree-accounting.json`
- Markdown: `reports/full-tree-accounting.md`
- JSON: `reports/protocol-gap-report.json`
- Markdown: `reports/protocol-gap-report.md`
- JSON: `reports/framework-blueprint-delta.json`
- Markdown: `reports/framework-blueprint-delta.md`
- JSON: `reports/audit-strike-board.json`
- Markdown: `reports/audit-strike-board.md`

The combined report also folds in the current state of:

- `scripts/check-invariants.ts`
- `coverage/coverage-final.json`
- `benchmarks/directive-gate.json`
- `reports/runtime-seams.json`

Missing supporting artifacts are reported explicitly in the audit output instead of
failing the lane by default.

`reports/codebase-audit.*` now carries summary rollups for:

- full-tree accounting vs scored authored inventory
- per-file `roadTo100`, blocking signals, evidence refs, protocol coverage, and manual review status
- protocol-gap posture against the repo's high-integrity construction model
- framework-blueprint delta against the current architecture
- a ranked strike board of low-score files and high-signal architecture opportunities

## Rule Categories

### Structure

- package-topology
- missing-manifest-dependency
- unresolved-internal-import
- unknown-internal-package
- orphan-export-candidate
- default-export

### Integrity

- stub-marker
- missing-runtime-capability
- fallback-laundering
- console-call
- placeholder-content
- suspicious-reimplementation

### Surface

- package-export-surface
- host-surface
- virtual-module-surface

### Support

- artifact-missing / artifact-failed
- runtime-seam-hotspot
- runtime-seam-diagnostic

## Severity Meanings

- `error`: high-confidence architecture or surface breakage
- `warning`: advisory issue worth cleanup before it becomes a gate
- `info`: useful queue-shaping signal, not a stop-ship

## Allowlist Policy

The audit intentionally classifies a few known patterns instead of treating them as
repo failures:

- Astro client directives keep default exports because that is how Astro binds them
- `packages/vite/src/virtual-modules.ts` is allowed to expose documented placeholder
  stubs for bundler/type-checker compatibility
- The GPU directive's current WebGPU/WGSL gap is treated as an explicitly documented
  partial capability surface, not a hidden fraud path

Allowlisted findings are retained in the report under `suppressed` so the repo keeps
its chain of custody instead of silently ignoring exceptions.

## Promotion Path

Wave 1 keeps the audit advisory-first:

1. Generate combined reports and review the signal quality.
2. Fix high-confidence findings and trim any noisy heuristics.
3. Promote stable, low-noise rules into hard gates only after one cleanup cycle.

The existing fast-lane invariant checker stays separate on purpose. It remains the
small, cheap pre-flight check while the broader audit matures.
