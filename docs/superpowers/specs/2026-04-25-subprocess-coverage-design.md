# Spec: Subprocess Coverage + Coverage-Gate Closure

**Status:** Drafted 2026-04-25
**Scope owner:** czap toolchain
**Tracks:** A (subprocess plumbing), B (gap-file tests), C (borderline cleanup)
**Acceptance gate:** `pnpm gauntlet:full` exits 0 from a clean clone, with no entries added to `coverageExclude` in `vitest.shared.ts` and no thresholds lowered in `scripts/merge-coverage.ts`.

## 1. Background

`pnpm gauntlet:full` currently passes every step except the final `coverage:merge` gate. The merge fails for three reasons:

1. **Spawned-subprocess gap.** Six runtime files end up at 0% line coverage in the merged report:
   - `packages/cli/src/bin.ts`
   - `packages/cli/src/commands/scene-dev.ts`
   - `packages/scene/src/dev/server.ts`
   - `packages/mcp-server/src/http.ts`
   - `packages/mcp-server/src/start.ts`
   - `packages/scene/src/dev/player.ts`

   Of these, `bin.ts`, `scene-dev.ts`, and `server.ts` *are* exercised by integration tests — but only via `child_process.spawn`, and v8 coverage in the parent vitest worker can't see across the process boundary by default.

2. **Real test gaps.** `mcp-server/src/http.ts` has a test that inlines a copy of the handler instead of calling `runHttp`. `mcp-server/src/start.ts` has no test at all. `mcp-server/src/stdio.ts`'s auto-run guard at the bottom of the file is unreached. `scene/src/dev/player.ts` is browser code that no test ever loads. These are missing-test problems, not coverage-plumbing problems.

3. **Borderline misses.** Three packages sit just below their per-package gate:
   - `core` functions 96.23% (gate 97%)
   - `web` functions 96.77% (gate 97%)
   - `remotion` statements 83.78% (gate 85%)

The pragmatic fix would be to extend `coverageExclude` and call it done. We are explicitly rejecting that option. The coverage gate exists to catch real regressions; lowering it converts a useful signal into noise.

## 2. Goals

- **Primary:** `pnpm gauntlet:full` passes from a clean clone with the existing thresholds untouched and no new exclude entries.
- **Secondary:** the resulting subprocess-coverage plumbing is the canonical Windows + Linux + macOS spawn helper for the codebase. Future code that spawns processes goes through it without needing to think about coverage.
- **Tertiary:** future regressions in subprocess coverage trip an immediate, named test rather than a silent drop in the merged percentage.

## 3. Non-goals

- Running gauntlet phase 4 scripts (`test:vite`, `test:astro`, `test:tailwind`, `package:smoke`, `bench`) under coverage. They are out-of-process integration tests that prove built artifacts work end-to-end; their unit tests already cover the same code paths and contribute to the merged coverage.
- iOS / Android / non-Node platforms. czap's runtime *output* targets mobile Safari, but the toolchain itself runs only on developer machines (Windows now, Linux in CI; macOS supported via the POSIX branch but not currently exercised).
- Replacing vitest's coverage provider. The native `@vitest/coverage-v8` pipeline (NODE_V8_COVERAGE → v8-to-istanbul → coverage-final.json) is reused unchanged.

## 4. Architecture

The work splits into three orthogonal tracks that share one acceptance gate.

### Track A — Subprocess coverage plumbing

A single canonical spawn helper at `scripts/lib/spawn.ts` owns all subprocess work in the codebase. One file, one `process.platform === 'win32'` boolean branch (cmd.exe wrapper) versus the POSIX bare-argv branch (Linux, macOS, *BSD).

The three existing spawn paths collapse into thin re-exports:

- `packages/cli/src/spawn-helpers.ts` → re-exports `scripts/lib/spawn.ts`'s `spawnArgv` and `quoteWindowsArg`. Public API unchanged for production callers.
- `scripts/support/pnpm-process.ts` → re-exports the same `quoteWindowsArg` and any spawn primitives it currently re-implements.
- `tests/integration/cli/scene-dev.test.ts` (and the new subprocess-driven tests) — import from `scripts/lib/spawn.ts` directly.

The existing `tests/unit/spawn-quoting-drift.test.ts` is retargeted to enforce byte-equivalence of `quoteWindowsArg` between `scripts/lib/spawn.ts` and the two re-exporters.

#### Coverage capture mechanism

No new env var is introduced. The mechanism is Node's native `NODE_V8_COVERAGE` inheritance:

1. When `coverage:node` runs vitest with `--coverage` and provider=v8, vitest sets `NODE_V8_COVERAGE` on its workers automatically.
2. Workers spawn subprocesses via `scripts/lib/spawn.ts`. The helper preserves `process.env` by default — no env overrides — so children inherit `NODE_V8_COVERAGE`.
3. Children write v8 raw JSON dumps into the inherited dir on exit.
4. After tests finish, vitest's existing v8-to-istanbul pipeline converts every dump in the dir, filters by `vitest.shared.ts`'s `coverageInclude` / `coverageExclude` globs, and emits `coverage/node/coverage-final.json`.
5. The existing `scripts/merge-coverage.ts` reads that file alongside `coverage/browser/coverage-final.json` and produces the merged report.

The critical invariant: `scripts/lib/spawn.ts` must never construct an explicit `env` field for the child. A drift-guard test enforces this.

#### Lifecycle helper (DRY error handling)

A single `withSpawned(command, args, fn)` helper encapsulates spawn lifecycle:

```ts
export async function withSpawned<T>(
  command: string,
  args: readonly string[],
  fn: (handle: SpawnHandle) => Promise<T>,
  opts?: SpawnArgvOpts,
): Promise<T> {
  const handle = startSpawn(command, args, opts);
  try {
    return await fn(handle);
  } finally {
    await handle.dispose();
  }
}
```

`dispose()` is idempotent: SIGINT, wait 2s, SIGKILL if still alive, no-op if already exited. Tests never write `try/finally proc.kill()` themselves. One implementation, identical on Linux and Windows (Windows treats SIGINT as `taskkill /T`).

#### Lint enforcement

A new `no-restricted-imports` rule in `eslint.config.js` rejects `node:child_process` imports outside `scripts/lib/spawn.ts` itself. Existing files migrate before the rule is enforced. CI's `lint` step catches future violations.

### Track B — Real tests for gap files

These are missing-test problems. Track A does not solve any of them on its own.

| File | Current state | Fix |
|---|---|---|
| `mcp-server/src/http.ts` | `tests/integration/mcp/http.test.ts` inlines a copy of the handler instead of calling `runHttp`. The file has no auto-run guard, so spawning it directly is impossible. | (1) Add an `import.meta.url === ...` auto-run guard at the bottom of `http.ts` matching the pattern already in `stdio.ts`, with the bind string read from `process.argv[2]` (default `:0`). (2) Rewrite the test to spawn `tsx packages/mcp-server/src/http.ts :0` via `withSpawned`, read the resolved URL from the child's startup-receipt stdout line, then exercise `tools/list`, `tools/call`, parse-error, batch-with-mixed-notifications, notification-only-batch, and non-POST 405 cases against the real handler. SIGINT cleanup via `withSpawned.dispose()`. |
| `mcp-server/src/start.ts` | No test | New `tests/unit/mcp-server/start.test.ts` uses `vi.mock(...)` to stub `./http.js` and `./stdio.js`, then asserts that `start({ http: ':0' })` calls the mocked `runHttp` with `':0'` and `start({})` calls the mocked `runStdio`. Pure dispatch logic; no real server starts. |
| `mcp-server/src/stdio.ts` auto-run | The `for-await` loop is covered, but the `import.meta.url === ...` auto-run guard at the bottom of the file is not | New `tests/integration/mcp/stdio-spawn.test.ts` spawns `tsx packages/mcp-server/src/stdio.ts` via `withSpawned`, pipes a JSON-RPC request to stdin, asserts the response on stdout. |
| `scene/src/dev/player.ts` | Browser code, no test ever navigates to the dev player URL | New `tests/browser/scene-dev-player.test.ts` (Playwright) spawns the dev server, navigates with `page.goto(url)`, drives every keyboard shortcut (`space`, `[`, `]`, `,`, `.`) and every button (`play`, `pause`, `back`, `fwd`), asserts the frame label updates and the HMR log line appends. Browser provider captures coverage natively. |

`scene/src/dev/server.ts`, `cli/src/bin.ts`, and `cli/src/commands/scene-dev.ts` get their coverage automatically once Track A lands — the existing `tests/integration/cli/scene-dev.test.ts` already spawns the chain `tsx → bin.ts → run() → sceneDev() → server.ts`, and after Track A those subprocesses contribute coverage.

### Track C — Borderline cleanup

Audit-driven, mechanical, no architecture changes.

1. A scratch script `scripts/audit/uncovered-functions.ts` (deleted after use) reads `coverage/coverage-final.json`, lists every function with `count: 0` in `core`, `web`, `remotion` packages with file:line and signature.
2. Each uncovered function gets one of three resolutions, in priority order:
   1. **Add a real unit test** — preferred for most cases. Tests live alongside existing `tests/unit/{core,web,remotion}/*.test.ts`.
   2. **Refactor to remove the unused branch** — when the uncovered code is genuinely defensive against an impossible condition.
   3. `/* c8 ignore next */` with a one-line `// reason: ...` comment — only when the branch is unreachable in practice and refactoring would harm readability. Capped at ≤5 occurrences across the entire repo.
3. Re-run `pnpm coverage:merge`. Targets:
   - `core` functions ≥97%
   - `web` functions ≥97%
   - `remotion` statements ≥85%

## 5. Components

### New files

| Path | Purpose |
|---|---|
| `scripts/lib/spawn.ts` | Canonical cross-platform spawn. Exports `spawnArgv`, `withSpawned`, `quoteWindowsArg`, `SpawnHandle`, `SpawnResult`. Internal `resolveLauncher` boolean-branches on `process.platform === 'win32'`. |
| `tests/browser/scene-dev-player.test.ts` | Playwright test that loads the scene dev player and exercises every interactive control. |
| `tests/integration/mcp/stdio-spawn.test.ts` | Spawns `tsx packages/mcp-server/src/stdio.ts`, exercises the auto-run guard. |
| `tests/unit/mcp-server/start.test.ts` | Unit test for both transport branches of `start()`, using `vi.mock(...)` to stub `./http.js` and `./stdio.js`. Asserts dispatch wiring without launching a real server. |
| `tests/unit/meta/spawn-coverage-inheritance.test.ts` | Drift guard: spawns a child, asserts `NODE_V8_COVERAGE` is observable in the child's `process.env`. |
| `tests/unit/meta/coverage-config.test.ts` | Asserts `vitest.shared.ts`'s `coverageExclude` length and `merge-coverage.ts`'s `PACKAGE_THRESHOLD_OVERRIDES` are unchanged from the values committed at the close of this spec. Prevents silent gate-lowering. |
| `tests/unit/meta/c8-ignore-budget.test.ts` | Scans the repo for `/* c8 ignore` comments, fails if total count exceeds 5. |
| New `tests/unit/{core,web,remotion}/*.test.ts` files as needed by Track C audit | Per-function tests to lift the borderline misses to gate. Exact files determined during the audit pass; estimated 5–15 small test files. |

### Rewritten files

| Path | Change |
|---|---|
| `tests/integration/mcp/http.test.ts` | Drop the inlined `makeTestServer` helper. Spawn `tsx packages/mcp-server/src/http.ts :0` via `withSpawned`, read the resolved URL from stdout, exercise the real `runHttp` against the spawned server. |
| `tests/integration/cli/scene-dev.test.ts` | Replace raw `spawn(...)` with `withSpawned`. Behavior preserved. |
| `packages/cli/src/spawn-helpers.ts` | Becomes a thin re-export of `scripts/lib/spawn.ts`. Public API identical. |
| `scripts/support/pnpm-process.ts` | Becomes a re-export of `scripts/lib/spawn.ts`'s `quoteWindowsArg` and any spawn primitives. |
| `tests/unit/spawn-quoting-drift.test.ts` | Retargeted to enforce byte-equivalence of `quoteWindowsArg` across `scripts/lib/spawn.ts`, `packages/cli/src/spawn-helpers.ts`, and `scripts/support/pnpm-process.ts`. |

### Surgical edits

| Path | Change |
|---|---|
| `packages/mcp-server/src/http.ts` | Add `import.meta.url === ...` auto-run guard at the bottom, mirroring the pattern in `stdio.ts`. Reads bind string from `process.argv[2]` (default `:0`). 4-line addition; preserves existing `runHttp` export. |
| `eslint.config.js` (or `.eslintrc*`) | Add `no-restricted-imports` rule banning `node:child_process` outside `scripts/lib/spawn.ts`. |
| `vitest.browser.config.ts` | Verify `'tests/browser/**/*.test.ts'` glob picks up the new player test. No expected change to the file itself; just confirmation. |
| Selected `/* c8 ignore next */` annotations on genuinely-unreachable defensive branches | One-line `// reason: ...` comment required on each. Total ≤5 across the repo. |

### Untouched on purpose

- `scripts/merge-coverage.ts` — existing v8 → istanbul → final.json pipeline absorbs subprocess coverage automatically. No change needed.
- `vitest.shared.ts`'s `coverageExclude` — does not grow.
- `merge-coverage.ts`'s `TOTAL_THRESHOLDS`, `PACKAGE_THRESHOLDS`, `PACKAGE_THRESHOLD_OVERRIDES` — unchanged. We move the code, not the gate.

## 6. Data flow

```
gauntlet.ts
   │
   ├── Phase 5: spawn `vitest run --coverage` (coverage:node)
   │     └── vitest sets NODE_V8_COVERAGE=<vitest-tmp>/coverage in worker env
   │           │
   │           └── worker imports tests/integration/cli/scene-dev.test.ts
   │                 └── test calls scripts/lib/spawn.ts → withSpawned('tsx', [bin.ts, 'scene', 'dev', ...], fn)
   │                       │  preserves env (default behavior, NOT overridden)
   │                       ▼
   │                       child A: tsx → bin.ts → run() → sceneDev() → loadStartDevServer()
   │                             │  inherits NODE_V8_COVERAGE
   │                             │
   │                             └── dynamic import of scene/dev/server.ts → vite createServer()
   │                                   │  vite plugins, internal vite spawns — all inherit
   │                                   │
   │                                   └── on process exit (SIGINT from withSpawned dispose):
   │                                         v8 writes coverage-<pid>-<seq>-<hash>.json
   │                                         into <vitest-tmp>/coverage/
   │
   │     └── (same dir collects) child B: stdio-spawn test → mcp-server/src/stdio.ts
   │     └── (same dir collects) child C: http test → mcp-server/src/http.ts via runHttp
   │
   │     └── after all tests exit, @vitest/coverage-v8 provider:
   │           1. globs <vitest-tmp>/coverage/*.json
   │           2. for each file → v8-to-istanbul:
   │                - resolve url back to repo-relative path (handles tsx file:// URLs + inline source maps)
   │                - emit istanbul-format file coverage object
   │           3. filter by vitest.shared.ts coverageInclude (packages/*/src/**/*.ts)
   │           4. discard coverageExclude matches
   │           5. merge into single coverage map → coverage/node/coverage-final.json
   │
   ├── Phase 5: spawn `vitest run --config vitest.browser.config.ts --coverage` (coverage:browser, parallel)
   │     └── Playwright launches Chromium with v8 instrumentation
   │           └── tests/browser/scene-dev-player.test.ts spawns dev server via withSpawned,
   │                 page.goto(url) navigates Chromium to player.html
   │                 → player.ts executes in browser → v8 coverage captured by browser provider
   │                 → coverage/browser/coverage-final.json
   │
   └── Phase 5: scripts/merge-coverage.ts
         1. read coverage/node/coverage-final.json     (now includes subprocess data)
         2. read coverage/browser/coverage-final.json  (now includes player.ts)
         3. createCoverageMap, merge both
         4. write coverage/coverage-final.json + html + lcov + text
         5. compute per-package totals
         6. compare to TOTAL_THRESHOLDS / PACKAGE_THRESHOLDS / overrides
         7. exit 0 if all gates pass, 1 + diagnostic list if not
```

### Invariants the flow depends on

1. **Env-preservation in spawn helper.** `scripts/lib/spawn.ts` never constructs an `env` field for the child. Drift guard: `tests/unit/meta/spawn-coverage-inheritance.test.ts`.
2. **Source path resolution for `tsx`-loaded files.** v8-to-istanbul resolves `file://` URLs to repo paths via tsx's inline source maps. Verified by the de-risking spike (Section 8). Fallback if the spike fails: a tiny `scripts/merge-subprocess-v8.ts` step that runs `c8 report` against the same dir before vitest's own merge.
3. **Coverage filter happens at merge time.** Subprocesses write all v8 coverage; include/exclude globs filter at the end.
4. **Browser test must navigate, not just spawn.** `page.goto(url)` is mandatory in the player test; spawning the dev server alone leaves `player.ts` at 0%.

## 7. Error handling and edge cases (DRY)

Two places own error handling, no others.

### Place 1 — `scripts/lib/spawn.ts` owns subprocess lifecycle

Three concerns collapse into `withSpawned` + `SpawnHandle`:

1. **Subprocess crashes mid-test** — `dispose()` is idempotent; tests never see "process already dead" errors.
2. **Hung children** — SIGINT, wait 2s, SIGKILL. Same on Linux and Windows.
3. **stderr capture** — bounded ring buffer (existing pattern from `cli/spawn-helpers.ts`), exposed on the handle so failed assertions can include the child's last 16 KiB of stderr.

The four subprocess-driven tests each become one `withSpawned(...)` call wrapping the assertions. Zero `try/finally` outside `scripts/lib/spawn.ts`.

### Place 2 — `scripts/merge-coverage.ts` owns gate diagnostics

Already DRY; no change. Accumulates errors into one `errors[]`, prints all at once, exits 1 if non-empty.

### Edge cases

| Edge case | Handling |
|---|---|
| Port conflict | All subprocess-driven tests bind `:0` (ephemeral); read resolved port from child's startup receipt on stdout. |
| Windows path separators in v8 coverage JSON | `merge-coverage.ts` already calls `.replace(/\\/g, '/')`. No new code. |
| `NODE_V8_COVERAGE` accidentally stripped | Drift-guard test fails the build. |
| `tsx` source-map resolution breaks v8-to-istanbul on Windows | De-risking spike at task 1 of the implementation. Fallback: single `merge-subprocess-v8.ts` step. |
| Browser test flakes on slow CI | `page.waitForFunction(() => window.__czap_player_ready)` instead of fixed timeouts. One ready-flag in `player.ts`, one wait in the test. |
| Stale coverage between runs | `coverage/` already wiped per-run. No new sweep. |

### Explicitly not added

- Per-test `afterEach(proc.kill())` hooks — `withSpawned` makes them redundant.
- A `coverage:subprocess` standalone npm script — capture is ambient.
- Custom error classes — Node's `Error` plus `stderrTail` covers the diagnostic need.
- Retry logic on subprocess failure — flaky tests get fixed, not retried.

## 8. Verification strategy

### Track A acceptance

| Check | Mechanism |
|---|---|
| De-risking spike (gate before any other work) | Scratch test `tests/scratch/spike-subprocess-coverage.test.ts` (deleted after spike): spawns `tsx -e 'await import("./packages/cli/src/dispatch.js")'` via `scripts/lib/spawn.ts` under `vitest --coverage`, asserts `coverage/node/coverage-final.json` contains entries for `dispatch.ts` with non-zero coverage demonstrably from the child. Green → continue with simple design. Red → add `merge-subprocess-v8.ts` fallback, document why, continue. |
| Migration correctness | Existing tests pass identically before and after migration to `withSpawned`. Behavioral equivalence is the gate. |
| Drift guard | `tests/unit/meta/spawn-coverage-inheritance.test.ts` fails CI if any future commit adds an `env: {...}` override. |
| Lint enforcement | `no-restricted-imports` rejects raw `node:child_process` imports outside `scripts/lib/spawn.ts`. |
| Single-source-of-truth | Existing `tests/unit/spawn-quoting-drift.test.ts` retargeted to enforce byte-equivalence across `scripts/lib/spawn.ts`, `packages/cli/src/spawn-helpers.ts`, `scripts/support/pnpm-process.ts`. |

### Track B acceptance

Each gap file has a "moved off zero" signal in the merged coverage report:

| File | Coverage target |
|---|---|
| `mcp-server/src/http.ts` | ≥95% lines |
| `mcp-server/src/start.ts` | 100% |
| `mcp-server/src/stdio.ts` auto-run guard | 100% (whole file ≥95%) |
| `scene/src/dev/player.ts` | ≥95% |
| `scene/src/dev/server.ts` | ≥90% |
| `cli/src/bin.ts` | ≥90% |
| `cli/src/commands/scene-dev.ts` | ≥90% |

### Track C acceptance

Per-package thresholds met after audit + targeted tests:

- `core` functions ≥97%
- `web` functions ≥97%
- `remotion` statements ≥85%

Plus `/* c8 ignore */` budget ≤5 across the repo.

### Final acceptance

```
pnpm gauntlet:full   →   exit 0
```

with these meta-tests baked in:

- `tests/unit/meta/coverage-config.test.ts` — asserts `coverageExclude` length and `PACKAGE_THRESHOLD_OVERRIDES` unchanged.
- `tests/unit/meta/c8-ignore-budget.test.ts` — fails if `c8 ignore` count exceeds 5.

This makes "we lowered the gate to make it pass" structurally impossible without explicitly bumping a test's expected number, which surfaces in code review.

## 9. Implementation order (high-level)

1. **Spike** the v8-to-istanbul subprocess resolution path. 30 min. Decides whether the simple flow holds or the fallback merge step is needed.
2. **Build `scripts/lib/spawn.ts`** with `spawnArgv`, `withSpawned`, `SpawnHandle`, `quoteWindowsArg`. Behavior-equivalent to current `cli/spawn-helpers.ts` plus the lifecycle helper.
3. **Migrate** `packages/cli/src/spawn-helpers.ts` and `scripts/support/pnpm-process.ts` to thin re-exports. Run existing tests, confirm green.
4. **Migrate** test call sites to `withSpawned`. Existing scene-dev test stays green.
5. **Write Track B tests:** http (rewrite), start (new), stdio-spawn (new), scene-dev-player browser (new). Each lifts the matching file off 0%.
6. **Add ESLint rule** banning raw `child_process` imports. Run lint to confirm migrations are complete.
7. **Add drift guards:** `spawn-coverage-inheritance.test.ts`, `coverage-config.test.ts`, `c8-ignore-budget.test.ts`. Retarget `spawn-quoting-drift.test.ts`.
8. **Track C audit pass:** run `scripts/audit/uncovered-functions.ts`, write per-function tests / refactors / annotations until thresholds clear.
9. **Run `pnpm gauntlet:full` from a clean clone.** Iterate on any residual gaps until exit 0.
10. **Delete the spike file** and the audit script. Commit and ship.

The detailed task breakdown for each step is the responsibility of the subsequent writing-plans phase.

## 10. Open questions

None at design time. The spike in step 1 is the only structural unknown; both branches of its outcome are accommodated in the design.
