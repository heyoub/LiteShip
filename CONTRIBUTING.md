# Contributing to LiteShip

Thanks for considering a contribution. LiteShip is pre-1.0 and intentionally greenfield (we'd rather break things now than later), so most of the guidance here is about keeping the gauntlet honest, not gatekeeping.

Ontology for prose and docs: [docs/GLOSSARY.md](./docs/GLOSSARY.md). The git remote and directory name may still read `czap`; `@czap/*` on npm is the package line.

## Quick start (development)

```bash
# Clone + install
git clone https://github.com/TheFreeBatteryFactory/czap.git
cd czap
pnpm install

# Build everything
pnpm run build

# Fast inner loop (~75s)
pnpm test

# Full release-grade gate (~22min)
pnpm run gauntlet:full
```

Required versions: Node.js 22+, pnpm 10+. The repo runs on Windows + Linux,
PowerShell + bash. WebKit/Firefox/Chromium tests run on the system Playwright
install (`pnpm exec playwright install` if needed).

## The gauntlet, your release gate

`pnpm run gauntlet:full` is the contract: the full shake-down cruise. It runs ~30 phases:

- build, capsule:compile, typecheck, lint, docs:check, invariants
- the full vitest test surface (unit + component + property + integration)
- Vite, Astro, Tailwind integration smokes
- Playwright e2e + 10x stress + 10x stream-stress + 5x flake harness
- red-team regression suite
- benchmarks + bench gate + rolling-median trend gate + bench reality
- per-package publish smoke
- node + browser coverage + cross-runtime merge with statementMap dedup
- runtime-seams report, codebase audit, satellite scan
- feedback integrity verification (artifact fingerprint chain)
- runtime gate, capsule verify
- `flex:verify` 10/10 acceptance across 7 rating dimensions

**Bench trend gate (`bench:trend`):** it reads `benchmarks/history.jsonl` (one
JSON line per `bench:gate` run) and only enforces drift once there are three
distinct historical fingerprints. Until then it prints a skip message and
exits zero. Run the gauntlet (or `bench:gate`) a few times on `main` to warm
the file, or expect `bench:trend` to stay in "skipping" mode on fresh clones.

The gauntlet exits cleanly with `flex:verify PASSED — project is 10/10 by every rating dimension`, or it fails closed. Not a stylistic gate; a correctness gate. PRs need to be green here before merge.

For Windows users: PowerShell's `>` redirect writes UTF-16 LE; use
`Out-File -Encoding utf8` or run `chcp 65001` first to keep gauntlet logs
readable.

## PR conventions

- One concern per PR. Tightly-coupled changes (e.g. moving a sub-path
  export and updating consumers) can ship as one commit; otherwise split.
- Commit message style is conventional-ish:
  - `fix(<scope>): ...` for bug fixes
  - `feat(<scope>): ...` for new features
  - `chore(<scope>): ...` for tooling/housekeeping
  - `docs(<scope>): ...` for doc-only changes
  - `refactor(<scope>): ...` for non-behavioral cleanup
- The gauntlet is the final gate; don't skip pre-commit hooks (`--no-verify`
  is reserved for emergencies only).

## Code style

- TypeScript strict mode, ESM only (`.js` extensions in import specifiers
  per Node ESM rules)
- No default exports; named exports only
- Branded types via Effect's Brand module (`Brand.Branded<T, 'Tag'>`)
- Namespace-object pattern for module facades:

  ```ts
  export const Boundary = { make: _make, evaluate: _evaluate };
  export declare namespace Boundary {
    export type Shape = BoundaryShape;
  }
  ```

- Tests in `tests/unit/`, `tests/integration/`, `tests/component/`,
  `tests/property/`, `tests/smoke/`, `tests/regression/`, `tests/bench/`,
  `tests/e2e/`, `tests/browser/`, `tests/generated/`
- vitest is the runner everywhere except `tests/e2e/` (Playwright) and
  `tests/browser/` (vitest browser-mode via Playwright)
- Property-based tests via fast-check
- Imports from sibling packages use `@czap/*` aliases (resolved via
  `vitest.shared.ts` for tests, `Config.toTestAliases` for the runner)

## Testing lanes

- `pnpm test`: full node/jsdom surface (~75s)
- `pnpm test path/to/foo.test.ts`: single file, fastest feedback when you're chasing one failure
- `pnpm run test:e2e`: Playwright e2e (~6s)
- `pnpm run test:flake`: repeated runs of runtime-sensitive tests to catch flakes
- `pnpm run test:redteam`: security regressions
- `pnpm run bench`: full benchmark sweep with directive-overhead pairs and rolling-median trend gate
- `pnpm run coverage:merge`: node + browser coverage merge with statementMap-divergence dedup

The gauntlet runs all of these in sequence. Most PRs only need the fast
loop (`pnpm test`) until they touch something the larger lanes cover.

## Writing a regression test

### File-location convention

| Directory | What lives there |
| --------- | ---------------- |
| `tests/unit/` | Per-module correctness; one file per logical surface |
| `tests/property/` | Invariant proofs via fast-check |
| `tests/regression/` | Named bugs that must never re-appear |
| `tests/integration/` | Cross-package wiring |
| `tests/component/` | Isolated component rendering |

When you fix a bug, the regression test goes in `tests/regression/`. Name the file after the surface, not the ticket: `boundary-threshold.test.ts`, not `issue-412.test.ts`.

### The vitest pattern

```ts
import { describe, test, expect } from 'vitest';
import { Boundary } from '@czap/core';

describe('Boundary.evaluate threshold edge', () => {
  test('exact threshold value resolves to the upper state', () => {
    const b = Boundary.make({
      input: 'viewport.width',
      at: [[0, 'mobile'], [768, 'tablet']] as const,
    });
    expect(Boundary.evaluate(b, 768)).toBe('tablet');
  });
});
```

Add `// @vitest-environment jsdom` at the top of any file that touches the DOM (`parseHTML`, `document.createElement`, style reads, aria attributes). Without it, vitest runs under Node and `document` is undefined.

### The fast-check property-test pattern

Use `fc.assert(fc.property(...))` to state what must hold for *all* valid inputs, not just the ones you thought of:

```ts
import fc from 'fast-check';

test('evaluate never returns a state name outside the boundary definition', () => {
  fc.assert(
    fc.property(
      fc.uniqueArray(fc.integer({ min: 0, max: 10000 }), { minLength: 2, maxLength: 6 }),
      fc.integer({ min: 0, max: 10000 }),
      (rawThresholds, value) => {
        const sorted = rawThresholds.sort((a, b) => a - b);
        const pairs = sorted.map((t, i) => [t, `s${i}`] as const);
        const b = Boundary.make({ input: 'x', at: pairs as never });
        const validStates = pairs.map(([, name]) => name);
        return validStates.includes(Boundary.evaluate(b, value) as (typeof validStates)[number]);
      },
    ),
  );
});
```

fast-check runs 100 trials by default and shrinks failing inputs automatically. Put property tests in `tests/property/` when the invariant is general; put them in `tests/regression/` when they pin a specific bug.

### Worked example

**Bug:** after a refactor of `boundary.ts`, `Boundary.evaluate` was using `>` instead of `>=` on threshold comparisons, so `value === threshold` resolved to the state *below* the crossing rather than the state *at or above* it.

**Regression test** (`tests/regression/boundary-threshold.test.ts`):

```ts
import { describe, test, expect } from 'vitest';
import { Boundary } from '@czap/core';

describe('regression: Boundary.evaluate exact-threshold resolution', () => {
  const b = Boundary.make({
    input: 'viewport.width',
    at: [[0, 'mobile'], [768, 'tablet'], [1280, 'desktop']] as const,
  });

  test('value exactly at threshold resolves to the upper state, not the lower', () => {
    expect(Boundary.evaluate(b, 768)).toBe('tablet');
    expect(Boundary.evaluate(b, 1280)).toBe('desktop');
  });

  test('value one below threshold stays in the lower state', () => {
    expect(Boundary.evaluate(b, 767)).toBe('mobile');
    expect(Boundary.evaluate(b, 1279)).toBe('tablet');
  });
});
```

**Fix sketch:** the conditional in `packages/core/src/boundary.ts` near the threshold loop changed from `value > threshold` back to `value >= threshold`: one character, confirmed by the test turning green.

The test now lives permanently in `tests/regression/` and runs on every `pnpm test` invocation.

### Gauntlet integration

Worth noting: `pnpm test` is phase 7 of `pnpm run gauntlet:full` and covers the full vitest surface including `tests/regression/`; see [docs/STATUS.md](./docs/STATUS.md) for the complete phase list.

## Architecture changes

Architectural decisions live in [`docs/adr/`](./docs/adr). New ADRs follow
[`docs/adr/_template.md`](./docs/adr/_template.md). If you're proposing a
change that:

- alters a public package surface,
- changes a runtime contract (capsule kind, receipt envelope, plan IR),
- adds a new compile target or runtime adapter,
- adds a value to a publicly-exported type union (e.g. extending `MotionTier`, `UIQualityTier`, `OutputTarget`),
- shifts the trust boundary or security posture,

…draft an ADR alongside the code change. The Architecture rating dimension
in `flex:verify` checks the canonical ADR set is present.

**Extending a public type union** (e.g. adding `'chaotic'` to `MotionTier`) ripples wider than it looks because exhaustive `Record<Tier, …>` tables and any `satisfies` checks downstream stop compiling until every branch is updated. The blast-radius checklist:

1. Update the canonical declaration in `packages/_spine/*.d.ts` first (per ADR-0010).
2. Update the runtime definition in the owning `packages/*/src/*.ts` file (e.g. `packages/core/src/ui-quality.ts` for `MotionTier`).
3. Find every `Record<TheUnion, …>` in the repo and add the new arm. Common offenders: `TIER_TARGETS`, `DEVICE_CAPABILITY_SCORES`, capability-mapping functions.
4. Update any test that asserts an exhaustive list of values (typed as `T[]`, not `satisfies T[]` — TypeScript widens the manual list).
5. Document the semantic position in the ladder (or orthogonality) in the owning file's JSDoc.

The framework does not currently dedupe these declarations across `_spine` and the runtime module; the duplication is intentional under ADR-0010 (spine is the canonical type source; runtime modules carry the value-side). If you find a third copy somewhere, that's a bug — file an issue.

## Issues vs feature requests

- **Bug**: open a GitHub issue with the gauntlet phase, command, exit code, and log tail (the relevant ~50 lines, not the whole 22-min log).
- **Feature**: open a discussion or issue with what you're trying to do, what LiteShip doesn't currently let you do, and what shape an answer might have.
- **Security**: read [SECURITY.md](./SECURITY.md) and follow the private reporting path.

## Code of Conduct

This project follows the [Contributor Covenant](./CODE_OF_CONDUCT.md). Be
direct, be kind, ship things that work.
