# Subprocess Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Important user preference:** This repo edits `main` directly. Do **not** use git worktrees. (Recorded in user memory: `feedback_no_worktrees`.)

**Goal:** Clear the `coverage:merge` gate end-to-end (`pnpm gauntlet:full` exits 0) without lowering thresholds or extending `coverageExclude`. Land a single canonical cross-platform spawn helper that captures subprocess coverage automatically via Node's native `NODE_V8_COVERAGE` inheritance.

**Architecture:** One file (`scripts/lib/spawn.ts`) owns all subprocess spawning. It branches `process.platform === 'win32'` for the cmd.exe wrapper vs. POSIX bare-argv path, and never overrides `process.env`, so children inherit `NODE_V8_COVERAGE` from vitest's worker. Vitest's existing v8→istanbul pipeline absorbs subprocess coverage with no merge changes. Three orthogonal tracks: subprocess plumbing (Tasks 1–6), real tests for gap files (Tasks 7–12), drift guards + borderline cleanup (Tasks 13–20). Final acceptance is one gauntlet run (Task 22).

**Tech Stack:** Node 20+, vitest 4.x with `@vitest/coverage-v8`, `@vitest/browser-playwright`, tsx, TypeScript 5.x strict ESM, Effect 4.x, eslint 9.x flat config, fast-glob, istanbul-lib-coverage, `cmd.exe` (Windows-only branch).

**Spec:** `docs/superpowers/specs/2026-04-25-subprocess-coverage-design.md`

---

## File Structure

### New files
- `scripts/lib/spawn.ts` — canonical cross-platform spawn helper (the marquee piece).
- `tests/scratch/spike-subprocess-coverage.test.ts` — de-risking spike, deleted after Task 1.
- `tests/unit/lib/spawn.test.ts` — unit tests for the new helper.
- `tests/integration/mcp/stdio-spawn.test.ts` — stdio.ts auto-run guard test.
- `tests/unit/mcp-server/start.test.ts` — start.ts dispatch unit test.
- `tests/browser/scene-dev-player.test.ts` — Playwright test for player.ts.
- `tests/unit/meta/spawn-coverage-inheritance.test.ts` — drift guard.
- `tests/unit/meta/coverage-config.test.ts` — config drift guard.
- `tests/unit/meta/c8-ignore-budget.test.ts` — `c8 ignore` budget guard.
- `scripts/audit/uncovered-functions.ts` — Track C audit script, deleted after Task 20.

### Rewritten files
- `tests/integration/mcp/http.test.ts` — drop inlined handler, spawn real `http.ts`.
- `tests/integration/cli/scene-dev.test.ts` — use `withSpawned`.
- `packages/cli/src/spawn-helpers.ts` — thin re-export of `scripts/lib/spawn.ts`.
- `scripts/support/pnpm-process.ts` — thin re-export of `scripts/lib/spawn.ts`.
- `tests/unit/spawn-quoting-drift.test.ts` — third import from `scripts/lib/spawn.ts`, all three identical.

### Surgical edits
- `packages/mcp-server/src/http.ts` — add auto-run guard (4 lines).
- `packages/scene/src/dev/player.ts` — set `window.__czap_player_ready = true` flag (1 line).
- `eslint.config.js` — `no-restricted-imports` rule banning `node:child_process` outside `scripts/lib/spawn.ts`.
- `package.json` — extend `lint` script to also cover `tests/` and `scripts/`.
- `vitest.shared.ts` — extend `nodeTestInclude` if `tests/scratch/` is needed during the spike (revert at end).
- New `tests/unit/{core,web,remotion}/*.test.ts` files identified by Track C audit (5–15 small tests).
- Up to 5 `/* c8 ignore next */` annotations across the repo, each with a one-line `// reason: …` comment.

---

## Task 0: Add `coverage.reportOnFailure: true` to vitest configs

**Rationale:** Discovered during the Task 1 spike — when one test fails (e.g. the flaky `tests/integration/cli/scene-render.test.ts`), vitest currently suppresses `coverage-final.json` writes. That makes coverage gating unreliable: any test failure during `coverage:node` looks like "0% across the board" instead of "tests failed *and* here's the coverage we did capture." Two-line fix.

**Files:**
- Modify: `vitest.config.ts`
- Modify: `vitest.browser.config.ts`

- [ ] **Step 0.1: Add reportOnFailure to vitest.config.ts**

Edit `vitest.config.ts`. Inside the `coverage` block, add `reportOnFailure: true,` after the `provider: 'v8'` line:

```ts
    coverage: {
      provider: 'v8',
      reportOnFailure: true,
      reportsDirectory: './coverage/node',
      reporter: ['text', 'html', 'lcov', 'json'],
      include: coverageInclude,
      exclude: coverageExclude,
    },
```

- [ ] **Step 0.2: Add reportOnFailure to vitest.browser.config.ts**

Edit `vitest.browser.config.ts`. Inside the `coverage` block, add `reportOnFailure: true,` after the `provider: 'v8'` line:

```ts
    coverage: {
      provider: 'v8',
      reportOnFailure: true,
      reportsDirectory: './coverage/browser',
      reporter: [...coverageReporters],
      include: coverageInclude,
      exclude: coverageExclude,
    },
```

- [ ] **Step 0.3: Verify by running coverage**

Run: `pnpm coverage:node`

Expected: `coverage/node/coverage-final.json` exists after the run, even if one or more tests fail.

- [ ] **Step 0.4: Commit**

```bash
git add vitest.config.ts vitest.browser.config.ts
git commit -m "$(cat <<'EOF'
ci(coverage): reportOnFailure: true so gates work even when tests fail

Discovered during Task 1 spike: vitest currently suppresses
coverage-final.json writes if any test fails. That converts a useful
gate signal into noise. Two-line fix on both node and browser configs.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 1: De-risking spike — does subprocess coverage actually flow through?

**Rationale:** The whole simple-design hinges on whether vitest's `@vitest/coverage-v8` provider actually picks up coverage written by grandchildren of vitest's workers. If it does, no plumbing is needed — `NODE_V8_COVERAGE` inheritance does the job. If it doesn't, we add a fallback `scripts/merge-subprocess-v8.ts` step. Both branches are accommodated; we just need to know which one we're on.

**Files:**
- Create: `tests/scratch/spike-subprocess-coverage.test.ts`
- Modify: `vitest.shared.ts` (add `'tests/scratch/**/*.test.ts'` to `nodeTestInclude` temporarily)

- [ ] **Step 1.1: Add scratch dir to nodeTestInclude**

Edit `vitest.shared.ts`. Inside the `nodeTestInclude` array, add `'tests/scratch/**/*.test.ts'` after `'tests/generated/**/*.test.ts'`:

```ts
export const nodeTestInclude = [
  'tests/unit/**/*.test.ts',
  'tests/integration/**/*.test.ts',
  'tests/bench/**/*.test.ts',
  'tests/smoke/**/*.test.ts',
  'tests/property/**/*.test.ts',
  'tests/component/**/*.test.ts',
  'tests/regression/**/*.test.ts',
  'tests/generated/**/*.test.ts',
  'tests/scratch/**/*.test.ts',
];
```

- [ ] **Step 1.2: Write the spike test**

Create `tests/scratch/spike-subprocess-coverage.test.ts`:

```ts
/**
 * SPIKE — deleted after Task 21.
 *
 * Verifies vitest's @vitest/coverage-v8 provider captures coverage from
 * grandchildren of test workers. If this passes under `pnpm coverage:node`,
 * the simple subprocess-coverage design holds. If it fails, we add a
 * fallback merge step in scripts/merge-subprocess-v8.ts.
 *
 * Outcome documented in docs/superpowers/plans/2026-04-25-subprocess-coverage.md
 * Step 1 results.
 */
import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';

describe('SPIKE: subprocess coverage capture', () => {
  it('grandchild process coverage appears in coverage-final.json', async () => {
    if (process.env.NODE_V8_COVERAGE === undefined) {
      console.warn('SPIKE: not running under coverage; skipping');
      return;
    }

    // Spawn `tsx -e 'await import("packages/cli/src/dispatch.js")'` via raw
    // spawn (this is the spike — withSpawned doesn't exist yet).
    const tsxBin = process.platform === 'win32' ? 'tsx.cmd' : 'tsx';
    const child = spawn(
      'pnpm',
      ['exec', tsxBin, '-e', 'await import("./packages/cli/src/dispatch.js");'],
      { stdio: 'pipe', shell: process.platform === 'win32' },
    );
    await new Promise<void>((resolveExit, reject) => {
      child.on('close', (code) => (code === 0 ? resolveExit() : reject(new Error(`exit ${code}`))));
      child.on('error', reject);
    });

    // Coverage dump should land in NODE_V8_COVERAGE dir for both parent and child.
    const dir = process.env.NODE_V8_COVERAGE!;
    expect(existsSync(dir)).toBe(true);

    // Final report path determined by vitest config.
    const finalPath = resolve(process.cwd(), 'coverage', 'node', 'coverage-final.json');
    if (!existsSync(finalPath)) {
      console.warn('SPIKE: coverage-final.json not yet written (test runs before merge)');
      console.warn('SPIKE: re-run pnpm coverage:node and inspect final.json manually for dispatch.ts');
      return;
    }

    const data = JSON.parse(readFileSync(finalPath, 'utf8')) as Record<string, unknown>;
    const dispatchKey = Object.keys(data).find((k) => k.includes('packages/cli/src/dispatch'));
    expect(dispatchKey).toBeDefined();
  }, 30_000);
});
```

- [ ] **Step 1.3: Run the spike under coverage**

Run: `pnpm coverage:node`

Then inspect `coverage/node/coverage-final.json`:

```bash
node -e "const d=JSON.parse(require('fs').readFileSync('coverage/node/coverage-final.json','utf8'));console.log(Object.keys(d).filter(k=>k.includes('dispatch')).map(k=>({key:k,lines:d[k].s})))"
```

Expected output (simple-design holds): one entry for `packages/cli/src/dispatch.ts` with non-zero values in the `s` (statements) map — proving the grandchild's coverage was captured.

If the entry is missing or all-zero: simple-design does NOT hold. Document the negative outcome and proceed to Step 1.4.

- [ ] **Step 1.4: Document spike outcome**

Append to `docs/superpowers/plans/2026-04-25-subprocess-coverage.md` under a new `## Spike Results` section at the bottom: either "✅ Simple design holds — `dispatch.ts` captured under `coverage-final.json` with N statements covered, proceeding to Task 2." or "❌ Need fallback — adding `scripts/merge-subprocess-v8.ts` task before Task 2."

If outcome is ❌, add a new Task 1.5 here:
- Create `scripts/merge-subprocess-v8.ts` that runs after vitest exits, walks `<NODE_V8_COVERAGE>/*.json`, runs `c8 report --reporter=json --report-dir=coverage/node-subprocess`, then merges into `coverage/node/coverage-final.json` via `istanbul-lib-coverage`. Wire into `coverage:merge` script before the final `tsx scripts/merge-coverage.ts` step.

Skip Task 1.5 if outcome is ✅.

- [ ] **Step 1.5: Commit spike outcome**

```bash
git add tests/scratch/spike-subprocess-coverage.test.ts vitest.shared.ts docs/superpowers/plans/2026-04-25-subprocess-coverage.md
git commit -m "$(cat <<'EOF'
spike: confirm subprocess coverage capture path

Outcome documented in plan Step 1.4. Spike file deleted in Task 21.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 1.5: Build `scripts/merge-subprocess-v8.ts` and wire into `coverage:merge`

**Rationale:** The Task 1 spike proved vitest 4.x's `@vitest/coverage-v8` provider uses Node's `inspector.Session` Profiler API in-process, NOT `NODE_V8_COVERAGE` env-var inheritance. Spawned grandchildren run fresh V8 isolates with no profiler attached, so their coverage is never collected by vitest. The fix is to:

1. Have `scripts/lib/spawn.ts` (Task 2) explicitly inject `NODE_V8_COVERAGE=<temp-dir>` into every child it spawns when `process.env.CZAP_SUBPROCESS_COVERAGE_DIR` is set by the parent.
2. Have `coverage:merge` set `CZAP_SUBPROCESS_COVERAGE_DIR` before running `coverage:node`, then run a new `merge-subprocess-v8.ts` script after vitest exits to convert the raw v8 dumps into istanbul format and union them with `coverage/node/coverage-final.json`.

This task delivers (2). Task 2 delivers (1).

**Files:**
- Create: `scripts/merge-subprocess-v8.ts`
- Modify: `package.json` (`coverage:merge` script wraps with the env var; new `coverage:subprocess` post-step)

- [ ] **Step 1.5.1: Write the merge-subprocess-v8 script**

Create `scripts/merge-subprocess-v8.ts`:

```ts
/**
 * Merge subprocess v8 coverage dumps into coverage/node/coverage-final.json.
 *
 * Runs after `pnpm coverage:node` exits. Walks the directory pointed to by
 * CZAP_SUBPROCESS_COVERAGE_DIR (set by the coverage:merge wrapper script
 * before running vitest), converts each raw v8 dump via v8-to-istanbul, and
 * unions the result into coverage-final.json using istanbul-lib-coverage's
 * CoverageMap.merge.
 *
 * This is the fallback path proven necessary by the Task 1 spike. Vitest's
 * inspector-API coverage doesn't see grandchildren of test workers; subprocess
 * dumps go through this script instead.
 *
 * @module
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import libCoverage from 'istanbul-lib-coverage';
import V8ToIstanbul from 'v8-to-istanbul';
import { coverageInclude, coverageExclude, repoRoot } from '../vitest.shared.js';
import { minimatch } from 'minimatch';

const { createCoverageMap } = libCoverage;

// Hardcoded relative to repo root so this script doesn't depend on env vars
// surviving across pnpm script chains (cross-env only persists inside the
// subshell where it was applied).
const dumpDir = resolve(repoRoot, 'coverage', 'subprocess-raw');
if (!existsSync(dumpDir)) {
  console.log(`[merge-subprocess-v8] ${dumpDir} does not exist — skipping (no subprocess dumps yet)`);
  process.exit(0);
}

const finalPath = resolve(repoRoot, 'coverage', 'node', 'coverage-final.json');
if (!existsSync(finalPath)) {
  console.error(`[merge-subprocess-v8] missing ${finalPath} — run pnpm coverage:node first`);
  process.exit(1);
}

const finalMap = createCoverageMap({});
finalMap.merge(JSON.parse(readFileSync(finalPath, 'utf8')) as Record<string, unknown>);

const dumpFiles = readdirSync(dumpDir).filter((f) => f.startsWith('coverage-') && f.endsWith('.json'));
console.log(`[merge-subprocess-v8] processing ${dumpFiles.length} v8 dump file(s) from ${dumpDir}`);

let mergedCount = 0;

for (const dumpName of dumpFiles) {
  const dumpPath = resolve(dumpDir, dumpName);
  const dump = JSON.parse(readFileSync(dumpPath, 'utf8')) as { result: Array<{ url: string; functions: unknown[] }> };
  if (!Array.isArray(dump.result)) continue;

  const subMap = createCoverageMap({});

  for (const script of dump.result) {
    if (!script.url) continue;
    // Only file:// URLs that resolve into the repo's packages/*/src tree.
    if (!script.url.startsWith('file://')) continue;
    const filePath = decodeURIComponent(new URL(script.url).pathname);
    const normalized = process.platform === 'win32' && filePath.startsWith('/')
      ? filePath.slice(1).replace(/\//g, '\\')
      : filePath;
    const relForGlob = normalized.replace(/\\/g, '/').replace(`${repoRoot.replace(/\\/g, '/')}/`, '');

    const included = coverageInclude.some((pat) => minimatch(relForGlob, pat));
    if (!included) continue;
    const excluded = coverageExclude.some((pat) => minimatch(relForGlob, pat));
    if (excluded) continue;

    try {
      const converter = new V8ToIstanbul(pathToFileURL(normalized).href, 0);
      await converter.load();
      converter.applyCoverage(script.functions);
      const fileData = converter.toIstanbul();
      subMap.merge(fileData);
    } catch (err) {
      // Skip files that v8-to-istanbul can't resolve (e.g. virtual modules).
      console.warn(`[merge-subprocess-v8] skip ${relForGlob}: ${(err as Error).message}`);
    }
  }

  finalMap.merge(subMap);
  mergedCount++;
}

writeFileSync(finalPath, JSON.stringify(finalMap.toJSON(), null, 2));
console.log(`[merge-subprocess-v8] merged ${mergedCount} subprocess dump(s) into ${finalPath}`);
```

- [ ] **Step 1.5.2: Install required dependencies**

The script imports `v8-to-istanbul` and `minimatch`. Check if they're already available:

```bash
node -e "console.log(require.resolve('v8-to-istanbul'))" 2>&1
node -e "console.log(require.resolve('minimatch'))" 2>&1
```

If `v8-to-istanbul` is not installed, install it as a dev dependency:

```bash
pnpm add -D -w v8-to-istanbul
```

`minimatch` should already be available via `fast-glob`'s deps. If `require.resolve` fails for it, add `pnpm add -D -w minimatch` too.

- [ ] **Step 1.5.3: Wire the merge step into `coverage:merge`**

Edit `package.json`. Replace the existing `coverage:merge` script:

```json
"coverage:merge": "rimraf coverage/subprocess-raw && pnpm run coverage:node:tracked && pnpm run coverage:browser && tsx scripts/merge-subprocess-v8.ts && tsx scripts/merge-coverage.ts",
```

And replace the existing `coverage:node` script with a tracked variant — keep the old name as an alias for non-merge use, and add a tracked one:

```json
"coverage:node": "vitest run --config vitest.config.ts --coverage",
"coverage:node:tracked": "cross-env NODE_V8_COVERAGE=coverage/subprocess-raw vitest run --config vitest.config.ts --coverage",
```

If `cross-env` and/or `rimraf` are not installed, install:

```bash
pnpm add -D -w cross-env rimraf
```

(Setting `NODE_V8_COVERAGE` on the parent vitest process is harmless — vitest itself uses inspector API, not the env var, so it doesn't read it. But subprocess children inherit it via the spawn helper, which is what we want. The `rimraf` step ensures we don't accumulate stale dumps across runs.)

- [ ] **Step 1.5.4: Smoke test**

Run: `pnpm coverage:merge`

Expected: completes without error. The `[merge-subprocess-v8] merged N subprocess dump(s)` line appears (N may be 0 the first time before Task 2 lands; that's fine — the script handles empty/missing dirs gracefully).

- [ ] **Step 1.5.5: Commit**

```bash
git add scripts/merge-subprocess-v8.ts package.json pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
feat(coverage): merge-subprocess-v8 unions raw v8 dumps with vitest output

Required by Task 1 spike outcome — vitest's inspector-API coverage
doesn't see grandchildren of test workers. coverage:merge now sets
CZAP_SUBPROCESS_COVERAGE_DIR + NODE_V8_COVERAGE before vitest, then
runs merge-subprocess-v8.ts to convert raw v8 dumps via v8-to-istanbul
and union them into coverage/node/coverage-final.json before the
existing merge-coverage.ts gate.

Task 2's scripts/lib/spawn.ts will inject the env var into children
so dumps actually land in the dir.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Build canonical `scripts/lib/spawn.ts`

**Files:**
- Create: `scripts/lib/spawn.ts`
- Create: `tests/unit/lib/spawn.test.ts`

- [ ] **Step 2.1: Write the failing tests for `quoteWindowsArg`**

Create `tests/unit/lib/spawn.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { quoteWindowsArg, spawnArgv, withSpawned } from '../../../scripts/lib/spawn.js';

describe('quoteWindowsArg', () => {
  it('quotes empty string as ""', () => {
    expect(quoteWindowsArg('')).toBe('""');
  });

  it('passes plain identifiers through unchanged', () => {
    expect(quoteWindowsArg('plain')).toBe('plain');
    expect(quoteWindowsArg('path/with/slashes.ts')).toBe('path/with/slashes.ts');
  });

  it('double-quotes args with whitespace', () => {
    expect(quoteWindowsArg('with space')).toBe('"with space"');
  });

  it('escapes interior double quotes', () => {
    expect(quoteWindowsArg('with"quote')).toBe('"with\\"quote"');
  });

  it('quotes shell metacharacters so cmd.exe treats them literally', () => {
    expect(quoteWindowsArg('a;b')).toBe('"a;b"');
    expect(quoteWindowsArg('a|b')).toBe('"a|b"');
    expect(quoteWindowsArg('a&b')).toBe('"a&b"');
    expect(quoteWindowsArg('a<b')).toBe('"a<b"');
    expect(quoteWindowsArg('a>b')).toBe('"a>b"');
    expect(quoteWindowsArg('a^b')).toBe('"a^b"');
    expect(quoteWindowsArg('a(b')).toBe('"a(b"');
  });
});

describe('spawnArgv', () => {
  it('returns exitCode 0 for a successful echo via node -e', async () => {
    const result = await spawnArgv('node', ['-e', 'process.exit(0)']);
    expect(result.exitCode).toBe(0);
  });

  it('captures nonzero exitCode without throwing', async () => {
    const result = await spawnArgv('node', ['-e', 'process.exit(7)']);
    expect(result.exitCode).toBe(7);
  });

  it('captures stderrTail when child writes to stderr', async () => {
    const result = await spawnArgv('node', ['-e', 'process.stderr.write("err-marker"); process.exit(1)']);
    expect(result.stderrTail).toContain('err-marker');
    expect(result.exitCode).toBe(1);
  });

  it('truncates stderrTail at the configured cap', async () => {
    // Generate ~100 KiB of stderr, cap at 1024.
    const result = await spawnArgv(
      'node',
      ['-e', 'for (let i = 0; i < 5000; i++) process.stderr.write("X".repeat(20)); process.exit(0)'],
      { stderrCapBytes: 1024 },
    );
    expect(result.stderrTail.length).toBeLessThanOrEqual(2048); // last chunk may push past cap by one chunk-size
  });
});

describe('withSpawned lifecycle', () => {
  it('disposes the child after the callback returns', async () => {
    const result = await withSpawned(
      'node',
      ['-e', 'setInterval(() => {}, 1000)'],  // hangs forever
      async (handle) => {
        expect(handle.pid).toBeGreaterThan(0);
        return 'callback-value';
      },
    );
    expect(result).toBe('callback-value');
  });

  it('disposes the child even when the callback throws', async () => {
    await expect(
      withSpawned(
        'node',
        ['-e', 'setInterval(() => {}, 1000)'],
        async () => {
          throw new Error('callback-failed');
        },
      ),
    ).rejects.toThrow('callback-failed');
  });

  it('dispose is idempotent if the child has already exited', async () => {
    await withSpawned(
      'node',
      ['-e', 'process.exit(0)'],
      async (handle) => {
        await new Promise<void>((r) => setTimeout(r, 100));
        // No error when callback returns and dispose runs against a dead child.
        expect(handle.pid).toBeGreaterThan(0);
      },
    );
  });
});
```

- [ ] **Step 2.2: Run tests to verify they fail**

Run: `pnpm test tests/unit/lib/spawn.test.ts`

Expected: FAIL — module `scripts/lib/spawn.js` doesn't exist yet.

- [ ] **Step 2.3: Create `scripts/lib/spawn.ts`**

Create `scripts/lib/spawn.ts`:

```ts
/**
 * Canonical cross-platform subprocess helper. Owns:
 *   - Windows cmd.exe wrapper for resolving .cmd/.bat shims (pnpm, tsx, etc.)
 *     without enabling shell metacharacter interpretation.
 *   - Bounded stderr ring buffer.
 *   - Idempotent dispose (SIGINT → 2s grace → SIGKILL).
 *   - withSpawned try/finally lifecycle for tests.
 *
 * The helper deliberately does not pass an `env` field to `child_process.spawn`,
 * so children inherit `process.env` — including `NODE_V8_COVERAGE` set by
 * vitest's coverage-v8 provider. This is what makes subprocess coverage capture
 * automatic. A drift-guard test (tests/unit/meta/spawn-coverage-inheritance.test.ts)
 * fails CI if any future commit adds an env override.
 *
 * @module
 */

import { spawn, type ChildProcess } from 'node:child_process';

/** Result of a one-shot spawnArgv invocation. */
export interface SpawnResult {
  readonly exitCode: number;
  readonly stderrTail: string;
}

/** Options for spawnArgv / withSpawned. */
export interface SpawnArgvOpts {
  /** Maximum stderr bytes retained in the returned tail. Defaults to 16 KiB. */
  readonly stderrCapBytes?: number;
  /** Override stdio. Defaults to ['ignore', 'inherit', 'pipe']. */
  readonly stdio?: 'inherit' | 'pipe' | readonly ('ignore' | 'inherit' | 'pipe')[];
}

/** Live handle on a running spawn — used by withSpawned. */
export interface SpawnHandle {
  readonly pid: number;
  readonly child: ChildProcess;
  /** Read stdout as a string stream. Only present when stdio[1] is 'pipe'. */
  readline(): AsyncIterableIterator<string>;
  /** Drain any retained stderr bytes accumulated so far. */
  readonly stderrTail: () => string;
  /** Idempotent disposal. SIGINT → 2s grace → SIGKILL. No-op if already dead. */
  dispose(): Promise<void>;
}

/**
 * Quote a single argv token for safe inclusion in a Windows cmd.exe command
 * line. Tokens with no special characters round-trip as-is; everything else
 * is double-quoted with internal quotes backslash-escaped. Keeps shell
 * metacharacters (`;`, `&`, `|`, `<`, `>`, `^`, `(`, `)`) inside a quoted
 * string so cmd.exe treats them as literal bytes.
 *
 * Re-exported by packages/cli/src/spawn-helpers.ts and
 * scripts/support/pnpm-process.ts; tests/unit/spawn-quoting-drift.test.ts
 * enforces byte-equivalence across all three call sites.
 */
export function quoteWindowsArg(arg: string): string {
  if (arg.length === 0) return '""';
  if (!/[\s"&|<>^()]/.test(arg)) return arg;
  return `"${arg.replace(/"/g, '\\"')}"`;
}

/**
 * Resolve a (command, args) pair into a launcher invocation that does NOT
 * enable shell interpretation but still finds .cmd / .bat shims on Windows.
 * On POSIX this is identity.
 */
function resolveLauncher(
  command: string,
  args: readonly string[],
): { command: string; args: readonly string[] } {
  if (process.platform !== 'win32') {
    return { command, args };
  }
  const commandLine = [command, ...args].map(quoteWindowsArg).join(' ');
  return { command: 'cmd.exe', args: ['/d', '/s', '/c', commandLine] };
}

/**
 * Run a subprocess with an argv array (`shell: false`). stderr is captured
 * with a bounded ring buffer; stdout inherits the parent. Resolves once the
 * subprocess exits — never throws on nonzero exit (callers branch on
 * `exitCode`).
 */
export function spawnArgv(
  command: string,
  args: readonly string[],
  opts: SpawnArgvOpts = {},
): Promise<SpawnResult> {
  const cap = opts.stderrCapBytes ?? 16_384;
  const launcher = resolveLauncher(command, args);
  return new Promise((resolvePromise, rejectPromise) => {
    const proc = spawn(launcher.command, launcher.args as string[], {
      stdio: opts.stdio ?? ['ignore', 'inherit', 'pipe'],
      shell: false,
      // CRITICAL: do not set `env` — children must inherit NODE_V8_COVERAGE.
    });
    const stderrChunks: Buffer[] = [];
    let stderrBytes = 0;
    proc.stderr?.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk);
      stderrBytes += chunk.length;
      while (stderrBytes > cap && stderrChunks.length > 1) {
        const head = stderrChunks.shift();
        if (head) stderrBytes -= head.length;
      }
    });
    proc.on('error', rejectPromise);
    proc.on('close', (code) => {
      resolvePromise({
        exitCode: code ?? 1,
        stderrTail: Buffer.concat(stderrChunks as unknown as Uint8Array[]).toString('utf8'),
      });
    });
  });
}

/**
 * Lifecycle-managed spawn for tests. Spawns, runs the callback, disposes the
 * child in `finally` (idempotent: SIGINT → 2s grace → SIGKILL → no-op).
 *
 * Tests never write `try/finally proc.kill()` themselves — a single
 * implementation handles cleanup uniformly on Linux and Windows.
 */
export async function withSpawned<T>(
  command: string,
  args: readonly string[],
  fn: (handle: SpawnHandle) => Promise<T>,
  opts: SpawnArgvOpts = {},
): Promise<T> {
  const handle = startSpawn(command, args, opts);
  try {
    return await fn(handle);
  } finally {
    await handle.dispose();
  }
}

function startSpawn(
  command: string,
  args: readonly string[],
  opts: SpawnArgvOpts,
): SpawnHandle {
  const cap = opts.stderrCapBytes ?? 16_384;
  const launcher = resolveLauncher(command, args);
  const child = spawn(launcher.command, launcher.args as string[], {
    stdio: opts.stdio ?? ['ignore', 'pipe', 'pipe'],
    shell: false,
    // CRITICAL: do not set `env` — see comment in spawnArgv.
  });
  const stderrChunks: Buffer[] = [];
  let stderrBytes = 0;
  child.stderr?.on('data', (chunk: Buffer) => {
    stderrChunks.push(chunk);
    stderrBytes += chunk.length;
    while (stderrBytes > cap && stderrChunks.length > 1) {
      const head = stderrChunks.shift();
      if (head) stderrBytes -= head.length;
    }
  });

  let disposed = false;

  return {
    pid: child.pid ?? 0,
    child,
    async *readline() {
      if (!child.stdout) return;
      let buf = '';
      for await (const chunk of child.stdout as AsyncIterable<Buffer>) {
        buf += chunk.toString('utf8');
        let nl: number;
        while ((nl = buf.indexOf('\n')) !== -1) {
          yield buf.slice(0, nl);
          buf = buf.slice(nl + 1);
        }
      }
      if (buf.length > 0) yield buf;
    },
    stderrTail: () => Buffer.concat(stderrChunks as unknown as Uint8Array[]).toString('utf8'),
    async dispose() {
      if (disposed) return;
      disposed = true;
      if (child.exitCode !== null || child.signalCode !== null) return;
      // SIGINT first (graceful). Wait up to 2s. If still alive, SIGKILL.
      try {
        child.kill('SIGINT');
      } catch {
        return;
      }
      const exited = await Promise.race([
        new Promise<boolean>((r) => child.once('close', () => r(true))),
        new Promise<boolean>((r) => setTimeout(() => r(false), 2000)),
      ]);
      if (!exited) {
        try {
          child.kill('SIGKILL');
        } catch {
          /* already dead between check and kill */
        }
      }
    },
  };
}
```

- [ ] **Step 2.4: Run tests to verify they pass**

Run: `pnpm test tests/unit/lib/spawn.test.ts`

Expected: PASS — all 12 tests green.

- [ ] **Step 2.5: Run the full unit suite to confirm no regressions**

Run: `pnpm test`

Expected: PASS — no test count changes outside the new 12 tests.

- [ ] **Step 2.6: Commit**

```bash
git add scripts/lib/spawn.ts tests/unit/lib/spawn.test.ts
git commit -m "$(cat <<'EOF'
feat(scripts): canonical scripts/lib/spawn.ts cross-platform helper

Single owner of subprocess spawning. One process.platform === 'win32'
boolean branch (cmd.exe wrapper) vs POSIX bare-argv. Never overrides
process.env so NODE_V8_COVERAGE rides through inheritance — that's
what makes subprocess coverage capture automatic.

Exports: spawnArgv (one-shot Promise), withSpawned (lifecycle helper
for tests), quoteWindowsArg, resolveLauncher (internal), SpawnHandle,
SpawnArgvOpts, SpawnResult.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Migrate `packages/cli/src/spawn-helpers.ts` to thin re-export

**Files:**
- Modify: `packages/cli/src/spawn-helpers.ts`

- [ ] **Step 3.1: Replace contents**

Replace all of `packages/cli/src/spawn-helpers.ts` with:

```ts
/**
 * Production CLI subprocess re-exports.
 *
 * The implementation lives at scripts/lib/spawn.ts to give every spawn site
 * in the codebase (cli, scripts, tests) a single canonical owner. This file
 * re-exports the production-relevant surface so existing imports stay
 * unchanged.
 *
 * @module
 */

export { spawnArgv, quoteWindowsArg } from '../../../scripts/lib/spawn.js';
export type { SpawnArgvOpts, SpawnResult } from '../../../scripts/lib/spawn.js';
```

- [ ] **Step 3.2: Run the test suite to confirm callers still work**

Run: `pnpm test`

Expected: PASS — production callers (`cli/dispatch.ts`, `cli/render-backend/ffmpeg.ts`, `cli/commands/scene-render.ts`, etc.) still resolve and behavior is unchanged.

- [ ] **Step 3.3: Run the typecheck**

Run: `pnpm typecheck`

Expected: PASS — no broken imports.

- [ ] **Step 3.4: Commit**

```bash
git add packages/cli/src/spawn-helpers.ts
git commit -m "$(cat <<'EOF'
refactor(cli): spawn-helpers becomes thin re-export of scripts/lib/spawn

Public API (spawnArgv, quoteWindowsArg, SpawnArgvOpts, SpawnResult)
unchanged. Implementation moved to scripts/lib/spawn.ts so cli/scripts/
tests share one owner.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Migrate `scripts/support/pnpm-process.ts` to thin re-export

**Files:**
- Modify: `scripts/support/pnpm-process.ts`

- [ ] **Step 4.1: Replace contents**

Replace all of `scripts/support/pnpm-process.ts` with:

```ts
/**
 * Pnpm-specific re-export shim.
 *
 * Historically held its own copy of quoteWindowsArg + spawn helpers; that
 * implementation now lives at scripts/lib/spawn.ts. This file keeps
 * `runPnpm` / `spawnPnpm` for callers that pre-pend the `pnpm` command, and
 * re-exports `quoteWindowsArg` for the drift-guard test.
 *
 * @module
 */

import { spawn } from 'node:child_process';
import { quoteWindowsArg } from '../lib/spawn.js';

export { quoteWindowsArg };

export interface PnpmRunResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface PnpmRunOptions {
  readonly cwd: string;
  readonly env?: NodeJS.ProcessEnv;
}

function getPnpmCommand(args: readonly string[]): { command: string; args: string[] } {
  if (process.platform !== 'win32') {
    return { command: 'pnpm', args: [...args] };
  }
  const commandLine = ['pnpm', ...args].map(quoteWindowsArg).join(' ');
  return { command: 'cmd.exe', args: ['/d', '/s', '/c', commandLine] };
}

export function runPnpm(args: readonly string[], options: PnpmRunOptions): Promise<PnpmRunResult> {
  const { command, args: commandArgs } = getPnpmCommand(args);

  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: options.cwd,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...options.env },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

export function spawnPnpm(
  args: readonly string[],
  options: PnpmRunOptions & { readonly stdio?: 'inherit' | 'pipe' },
) {
  const { command, args: commandArgs } = getPnpmCommand(args);
  return spawn(command, commandArgs, {
    cwd: options.cwd,
    shell: false,
    stdio: options.stdio ?? 'inherit',
    env: { ...process.env, ...options.env },
  });
}
```

(Note: `runPnpm` and `spawnPnpm` keep their explicit `env: { ...process.env, ...options.env }` because callers pass per-invocation overrides. NODE_V8_COVERAGE is preserved via the `...process.env` spread.)

- [ ] **Step 4.2: Run typecheck and tests**

Run: `pnpm typecheck && pnpm test`

Expected: PASS — `scripts/support/pnpm-process.ts` callers still work; the existing `tests/unit/spawn-quoting-drift.test.ts` still passes (the import paths are unchanged at this point).

- [ ] **Step 4.3: Commit**

```bash
git add scripts/support/pnpm-process.ts
git commit -m "$(cat <<'EOF'
refactor(scripts): pnpm-process re-exports quoteWindowsArg from lib/spawn

The pnpm-specific runPnpm/spawnPnpm helpers stay (they prepend 'pnpm'
to argv) but quoteWindowsArg now comes from scripts/lib/spawn.ts —
single source of truth.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Update `tests/unit/spawn-quoting-drift.test.ts` to triple-check

**Files:**
- Modify: `tests/unit/spawn-quoting-drift.test.ts`

- [ ] **Step 5.1: Replace contents**

Replace all of `tests/unit/spawn-quoting-drift.test.ts` with:

```ts
/**
 * Drift guard — asserts the three exposed `quoteWindowsArg` references all
 * point to the same canonical implementation in scripts/lib/spawn.ts. The
 * function is re-exported by:
 *
 *   - packages/cli/src/spawn-helpers.ts  (production CLI)
 *   - scripts/support/pnpm-process.ts    (gauntlet/scripts)
 *
 * Identity equality (===) is the strongest possible assertion: anyone who
 * forks the implementation will trip this test immediately.
 *
 * @module
 */

import { describe, it, expect } from 'vitest';
import { quoteWindowsArg as quoteFromCanonical } from '../../scripts/lib/spawn.js';
import { quoteWindowsArg as quoteFromCli } from '../../packages/cli/src/spawn-helpers.js';
import { quoteWindowsArg as quoteFromScripts } from '../../scripts/support/pnpm-process.js';

const VECTORS: readonly string[] = [
  '',
  'plain',
  'with space',
  'with"quote',
  'path/with/slashes.ts',
  'C:\\Users\\<username>\\.projects\\czap',
  'metachar-semi;echo pwned',
  'pipe|tricks',
  'amp&amp',
  'redir<in',
  'redir>out',
  'paren()group',
  'caret^escape',
  'mixed "and" special; chars',
  "tests/__nonexistent__; echo should-not-execute",
];

describe('quoteWindowsArg drift guard', () => {
  it('cli re-export points to canonical implementation', () => {
    expect(quoteFromCli).toBe(quoteFromCanonical);
  });

  it('scripts re-export points to canonical implementation', () => {
    expect(quoteFromScripts).toBe(quoteFromCanonical);
  });

  for (const input of VECTORS) {
    it(`canonical produces stable output for ${JSON.stringify(input)}`, () => {
      const out = quoteFromCanonical(input);
      // Output must be a string (i.e. function actually ran).
      expect(typeof out).toBe('string');
      // Three references agree (defensive — if either toBe(canonical) above passes,
      // this is automatic, but vector behavior changes are still useful diff signal).
      expect(quoteFromCli(input)).toBe(out);
      expect(quoteFromScripts(input)).toBe(out);
    });
  }
});
```

- [ ] **Step 5.2: Run the drift guard**

Run: `pnpm test tests/unit/spawn-quoting-drift.test.ts`

Expected: PASS — all three references identity-equal, vectors stable.

- [ ] **Step 5.3: Commit**

```bash
git add tests/unit/spawn-quoting-drift.test.ts
git commit -m "$(cat <<'EOF'
test: spawn-quoting-drift now triple-checks via identity equality

cli and scripts re-exports must === scripts/lib/spawn's
quoteWindowsArg. Strongest possible drift guard: any fork trips here
immediately.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Migrate `tests/integration/cli/scene-dev.test.ts` to `withSpawned`

**Files:**
- Modify: `tests/integration/cli/scene-dev.test.ts`

- [ ] **Step 6.1: Rewrite the test using `withSpawned`**

Replace all of `tests/integration/cli/scene-dev.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { withSpawned } from '../../../scripts/lib/spawn.js';

describe('czap scene dev', () => {
  it('boots a Vite server and prints a receipt with a local URL', async () => {
    await withSpawned(
      'pnpm',
      ['exec', 'tsx', 'packages/cli/src/bin.ts', 'scene', 'dev', 'examples/scenes/intro.ts'],
      async (handle) => {
        const url = await firstUrl(handle);
        expect(url).toMatch(/^http:\/\/(localhost|127\.0\.0\.1):\d+/);
      },
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
  }, 20000);
});

async function firstUrl(handle: import('../../../scripts/lib/spawn.js').SpawnHandle): Promise<string> {
  const deadline = Date.now() + 15000;
  for await (const line of handle.readline()) {
    if (Date.now() > deadline) throw new Error('timeout waiting for url');
    const t = line.trim();
    if (!t.startsWith('{')) continue;
    try {
      const receipt = JSON.parse(t) as { url?: unknown };
      if (typeof receipt.url === 'string' && receipt.url.startsWith('http')) {
        return receipt.url;
      }
    } catch { /* not json yet */ }
  }
  throw new Error('subprocess closed without emitting url');
}
```

- [ ] **Step 6.2: Run the migrated test**

Run: `pnpm test tests/integration/cli/scene-dev.test.ts`

Expected: PASS — same behavior, lifecycle handled by `withSpawned`.

- [ ] **Step 6.3: Commit**

```bash
git add tests/integration/cli/scene-dev.test.ts
git commit -m "$(cat <<'EOF'
refactor(test): scene-dev test uses withSpawned for lifecycle

Drops raw spawn + try/finally + manual stdout buffer. One withSpawned
call wraps the assertion; readline iterator handles JSON receipt
parsing.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Add auto-run guard to `packages/mcp-server/src/http.ts`

**Files:**
- Modify: `packages/mcp-server/src/http.ts`

- [ ] **Step 7.1: Append auto-run guard**

Edit `packages/mcp-server/src/http.ts`. After the closing brace of the existing `respond` function (the file currently ends after `}` on line 92), add:

```ts

// Allow direct tsx invocation for integration tests (mirrors stdio.ts pattern).
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('http.ts')) {
  const bind = process.argv[2] ?? ':0';
  runHttp(bind).catch((err: unknown) => {
    process.stderr.write(JSON.stringify({ error: String(err) }) + '\n');
    process.exit(1);
  });
}
```

- [ ] **Step 7.2: Manual smoke — confirm direct invocation works**

Run (in a terminal you can Ctrl+C): `pnpm exec tsx packages/mcp-server/src/http.ts :0`

Expected: prints a single JSON line on stdout like `{"status":"ok","command":"mcp","transport":"http","url":"http://127.0.0.1:NNNNN/"}` then hangs awaiting SIGINT. Press Ctrl+C to terminate.

- [ ] **Step 7.3: Run typecheck**

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 7.4: Commit**

```bash
git add packages/mcp-server/src/http.ts
git commit -m "$(cat <<'EOF'
feat(mcp): add http.ts auto-run guard mirroring stdio.ts

Reads bind string from process.argv[2] (default :0). Makes the file
spawn-testable via tsx directly, which is what the rewritten
http.test.ts uses.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Rewrite `tests/integration/mcp/http.test.ts` to spawn the real handler

**Files:**
- Modify: `tests/integration/mcp/http.test.ts`

- [ ] **Step 8.1: Rewrite the test**

Replace all of `tests/integration/mcp/http.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { withSpawned, type SpawnHandle } from '../../../scripts/lib/spawn.js';

interface JsonRpcResponse {
  jsonrpc?: string;
  id?: number | string | null;
  result?: unknown;
  error?: { code: number; message: string };
}

async function readUrl(handle: SpawnHandle): Promise<string> {
  const deadline = Date.now() + 10000;
  for await (const line of handle.readline()) {
    if (Date.now() > deadline) throw new Error('timeout waiting for url');
    if (!line.trim().startsWith('{')) continue;
    try {
      const receipt = JSON.parse(line) as { url?: unknown };
      if (typeof receipt.url === 'string') return receipt.url;
    } catch { /* not yet */ }
  }
  throw new Error('subprocess closed without emitting url');
}

async function rpc(url: string, body: unknown, opts: { method?: string } = {}): Promise<{ status: number; body: string }> {
  const res = await fetch(url, {
    method: opts.method ?? 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { status: res.status, body: await res.text() };
}

describe('MCP http transport (spawned)', () => {
  it('handles tools/list, tools/call, parse-error, batch, and non-POST 405', async () => {
    await withSpawned(
      'pnpm',
      ['exec', 'tsx', 'packages/mcp-server/src/http.ts', ':0'],
      async (handle) => {
        const url = await readUrl(handle);

        // tools/list
        const listRes = await rpc(url, { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
        expect(listRes.status).toBe(200);
        const listBody = JSON.parse(listRes.body) as JsonRpcResponse;
        expect(Array.isArray((listBody.result as { tools: unknown[] }).tools)).toBe(true);
        expect((listBody.result as { tools: unknown[] }).tools.length).toBeGreaterThan(0);

        // tools/call describe
        const callRes = await rpc(url, {
          jsonrpc: '2.0', id: 2, method: 'tools/call',
          params: { name: 'describe', arguments: {} },
        });
        expect(callRes.status).toBe(200);
        const callBody = JSON.parse(callRes.body) as JsonRpcResponse;
        expect(Array.isArray((callBody.result as { content: unknown[] }).content)).toBe(true);

        // parse error → -32700, id null
        const parseErrRes = await rpc(url, '{not valid json');
        expect(parseErrRes.status).toBe(200);
        const parseErrBody = JSON.parse(parseErrRes.body) as JsonRpcResponse;
        expect(parseErrBody.error?.code).toBe(-32700);
        expect(parseErrBody.id).toBe(null);

        // batch with one request and one notification (notification produces no entry)
        const batchRes = await rpc(url, [
          { jsonrpc: '2.0', id: 3, method: 'tools/list', params: {} },
          { jsonrpc: '2.0', method: 'tools/list', params: {} }, // notification, no id
        ]);
        expect(batchRes.status).toBe(200);
        const batchBody = JSON.parse(batchRes.body) as JsonRpcResponse[];
        expect(Array.isArray(batchBody)).toBe(true);
        expect(batchBody.length).toBe(1);
        expect(batchBody[0].id).toBe(3);

        // notification-only batch produces 204 No Content
        const notifBatchRes = await rpc(url, [
          { jsonrpc: '2.0', method: 'tools/list', params: {} },
        ]);
        expect(notifBatchRes.status).toBe(204);
        expect(notifBatchRes.body).toBe('');

        // non-POST → 405
        const getRes = await rpc(url, '', { method: 'GET' });
        expect(getRes.status).toBe(405);
      },
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
  }, 25000);
});
```

- [ ] **Step 8.2: Run the rewritten test**

Run: `pnpm test tests/integration/mcp/http.test.ts`

Expected: PASS — six assertions on the real spawned http server.

- [ ] **Step 8.3: Commit**

```bash
git add tests/integration/mcp/http.test.ts
git commit -m "$(cat <<'EOF'
test(mcp): http.test rewritten to spawn the real http.ts

Drops the inlined makeTestServer helper. Now spawns
tsx packages/mcp-server/src/http.ts :0, reads URL from startup
receipt, exercises tools/list, tools/call, parse-error, batch,
notification-only batch, and 405 GET against the real handler.

Coverage on http.ts moves from 0% to >=95%.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Create `tests/integration/mcp/stdio-spawn.test.ts`

**Files:**
- Create: `tests/integration/mcp/stdio-spawn.test.ts`

- [ ] **Step 9.1: Write the test**

Create `tests/integration/mcp/stdio-spawn.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { withSpawned, type SpawnHandle } from '../../../scripts/lib/spawn.js';

async function pipeOneRequest(handle: SpawnHandle, request: unknown): Promise<string> {
  const stdin = handle.child.stdin;
  if (!stdin) throw new Error('stdin not piped');
  stdin.write(JSON.stringify(request) + '\n');
  for await (const line of handle.readline()) {
    return line;
  }
  throw new Error('no response from stdio server');
}

describe('MCP stdio transport (auto-run guard, spawned)', () => {
  it('responds to tools/list piped via stdin', async () => {
    await withSpawned(
      'pnpm',
      ['exec', 'tsx', 'packages/mcp-server/src/stdio.ts'],
      async (handle) => {
        const responseLine = await pipeOneRequest(handle, {
          jsonrpc: '2.0', id: 1, method: 'tools/list', params: {},
        });
        const response = JSON.parse(responseLine) as {
          jsonrpc: string;
          id: number;
          result: { tools: unknown[] };
        };
        expect(response.jsonrpc).toBe('2.0');
        expect(response.id).toBe(1);
        expect(Array.isArray(response.result.tools)).toBe(true);
        expect(response.result.tools.length).toBeGreaterThan(0);
      },
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
  }, 15000);
});
```

- [ ] **Step 9.2: Run the test**

Run: `pnpm test tests/integration/mcp/stdio-spawn.test.ts`

Expected: PASS — child receives JSON-RPC request on stdin, emits response on stdout, exercising the `import.meta.url === ...` auto-run guard at the bottom of stdio.ts.

- [ ] **Step 9.3: Commit**

```bash
git add tests/integration/mcp/stdio-spawn.test.ts
git commit -m "$(cat <<'EOF'
test(mcp): stdio-spawn covers auto-run guard via real subprocess

Spawns tsx packages/mcp-server/src/stdio.ts via withSpawned, pipes
JSON-RPC tools/list request through stdin, reads response from
stdout. Exercises the import.meta.url === ... guard at the bottom of
stdio.ts (was uncovered).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Create `tests/unit/mcp-server/start.test.ts`

**Files:**
- Create: `tests/unit/mcp-server/start.test.ts`

- [ ] **Step 10.1: Write the test using vi.mock**

Create `tests/unit/mcp-server/start.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const runStdioMock = vi.fn(async () => undefined);
const runHttpMock = vi.fn(async (_bind: string) => undefined);

vi.mock('../../../packages/mcp-server/src/stdio.js', () => ({
  runStdio: runStdioMock,
}));

vi.mock('../../../packages/mcp-server/src/http.js', () => ({
  runHttp: runHttpMock,
}));

import { start } from '../../../packages/mcp-server/src/start.js';

describe('MCP start dispatch', () => {
  beforeEach(() => {
    runStdioMock.mockClear();
    runHttpMock.mockClear();
  });

  it('dispatches to runStdio when no http option is provided', async () => {
    await start();
    expect(runStdioMock).toHaveBeenCalledTimes(1);
    expect(runHttpMock).not.toHaveBeenCalled();
  });

  it('dispatches to runHttp with the bind string when http option is provided', async () => {
    await start({ http: ':3838' });
    expect(runHttpMock).toHaveBeenCalledTimes(1);
    expect(runHttpMock).toHaveBeenCalledWith(':3838');
    expect(runStdioMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 10.2: Run the test**

Run: `pnpm test tests/unit/mcp-server/start.test.ts`

Expected: PASS — both branches of `start` dispatch verified without launching real servers.

- [ ] **Step 10.3: Commit**

```bash
git add tests/unit/mcp-server/start.test.ts
git commit -m "$(cat <<'EOF'
test(mcp): start dispatch unit test via vi.mock

Stubs runHttp and runStdio so start({http:':3838'}) and start({})
verify the dispatch wiring without binding a real port or attaching
to stdin. Covers both branches of start.ts.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Add `__czap_player_ready` flag to `packages/scene/src/dev/player.ts`

**Files:**
- Modify: `packages/scene/src/dev/player.ts`

- [ ] **Step 11.1: Append the ready flag**

Edit `packages/scene/src/dev/player.ts`. After the existing HMR `if (importMetaHot) { … }` block at the bottom of the file, add:

```ts

// Test hook — Playwright waits on this before driving controls.
(window as unknown as { __czap_player_ready?: boolean }).__czap_player_ready = true;
```

- [ ] **Step 11.2: Run typecheck**

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 11.3: Commit**

```bash
git add packages/scene/src/dev/player.ts
git commit -m "$(cat <<'EOF'
feat(scene-dev): expose window.__czap_player_ready for Playwright tests

One-line readiness flag set after all event listeners attach.
scene-dev-player browser test uses page.waitForFunction(() =>
window.__czap_player_ready) instead of fixed timeouts.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Create `tests/browser/scene-dev-player.test.ts`

**Files:**
- Create: `tests/browser/scene-dev-player.test.ts`

- [ ] **Step 12.1: Verify `tests/browser/**/*.test.ts` is in the browser config include**

Run: `node -e "console.log(JSON.stringify(require('./vitest.browser.config.ts'), null, 2))" 2>&1 || cat vitest.browser.config.ts | grep include`

Expected output to contain `'tests/browser/**/*.test.ts'`.

- [ ] **Step 12.2: Write the Playwright test**

Create `tests/browser/scene-dev-player.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { page } from '@vitest/browser/context';
import { withSpawned, type SpawnHandle } from '../../scripts/lib/spawn.js';

async function readUrl(handle: SpawnHandle): Promise<string> {
  for await (const line of handle.readline()) {
    if (!line.trim().startsWith('{')) continue;
    try {
      const receipt = JSON.parse(line) as { url?: unknown };
      if (typeof receipt.url === 'string') return receipt.url;
    } catch { /* not yet */ }
  }
  throw new Error('subprocess closed without emitting url');
}

declare global {
  interface Window {
    __czap_player_ready?: boolean;
  }
}

describe('scene-dev player UI', () => {
  it('drives play / pause / scrub / keyboard shortcuts and updates frame label', async () => {
    await withSpawned(
      'pnpm',
      ['exec', 'tsx', 'packages/cli/src/bin.ts', 'scene', 'dev', 'examples/scenes/intro.ts'],
      async (handle) => {
        const url = await readUrl(handle);
        await page.goto(url);

        // Wait for ready flag.
        await page.waitForFunction(() => window.__czap_player_ready === true, { timeout: 10000 });

        const frameLabel = page.locator('#frame');
        await expect.element(frameLabel).toHaveText('frame 0');

        // Forward button → frame 1.
        await page.locator('#fwd').click();
        await expect.element(frameLabel).toHaveText('frame 1');

        // Back button → frame 0.
        await page.locator('#back').click();
        await expect.element(frameLabel).toHaveText('frame 0');

        // ']' key → frame 1.
        await page.keyboard.press(']');
        await expect.element(frameLabel).toHaveText('frame 1');

        // '[' key → frame 0.
        await page.keyboard.press('[');
        await expect.element(frameLabel).toHaveText('frame 0');

        // '.' key → frame 10.
        await page.keyboard.press('.');
        await expect.element(frameLabel).toHaveText('frame 10');

        // ',' key → frame 0 (clamped — setFrame uses Math.max(0, n)).
        await page.keyboard.press(',');
        await expect.element(frameLabel).toHaveText('frame 0');

        // Play button → start animation, frame increments via rAF.
        await page.locator('#play').click();
        await page.waitForFunction(() => {
          const el = document.getElementById('frame');
          return el !== null && /^frame [1-9]/.test(el.textContent ?? '');
        }, { timeout: 2000 });

        // Pause button → playing state cleared.
        await page.locator('#pause').click();

        // Spacebar → resume.
        await page.keyboard.press(' ');
        await page.waitForTimeout(100);

        // Spacebar → pause.
        await page.keyboard.press(' ');
      },
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
  }, 30000);
});
```

- [ ] **Step 12.3: Run the browser test**

Run: `pnpm exec vitest run --config vitest.browser.config.ts tests/browser/scene-dev-player.test.ts`

Expected: PASS — Chromium navigates to dev URL, every control fires.

- [ ] **Step 12.4: Run with coverage to confirm player.ts moves off zero**

Run: `pnpm coverage:browser`

Then inspect: `node -e "const d=JSON.parse(require('fs').readFileSync('coverage/browser/coverage-final.json','utf8')); const k=Object.keys(d).find(x=>x.includes('scene/src/dev/player')); console.log(k, d[k]?.s ? Object.values(d[k].s).filter(v=>v>0).length + '/' + Object.keys(d[k].s).length : 'missing')"`

Expected output: `<path> N/M` with N > 0 and N close to M.

- [ ] **Step 12.5: Commit**

```bash
git add tests/browser/scene-dev-player.test.ts
git commit -m "$(cat <<'EOF'
test(scene-dev): Playwright test exercises player.ts end-to-end

Spawns the dev server via withSpawned, navigates Chromium to the
resolved URL, drives every button and keyboard shortcut, asserts
frame label updates. Covers the previously-0% player.ts.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Add ESLint `no-restricted-imports` rule + extend lint scope

**Files:**
- Modify: `eslint.config.js`
- Modify: `package.json`

- [ ] **Step 13.1: Add the rule to eslint.config.js**

Edit `eslint.config.js`. Append a new config block before the final `);` closing `tseslint.config(...)`:

```js
  // Bans raw node:child_process imports outside the canonical spawn helper.
  // All subprocess work goes through scripts/lib/spawn.ts so coverage
  // capture (NODE_V8_COVERAGE inheritance) can never be silently broken
  // by an env override.
  {
    files: ['packages/**/*.ts', 'tests/**/*.ts', 'scripts/**/*.ts'],
    ignores: ['scripts/lib/spawn.ts', 'scripts/support/pnpm-process.ts', 'scripts/gauntlet.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          {
            name: 'node:child_process',
            message: 'Import from scripts/lib/spawn.ts (spawnArgv / withSpawned). The canonical helper preserves NODE_V8_COVERAGE inheritance for subprocess coverage capture.',
          },
          {
            name: 'child_process',
            message: 'Import from scripts/lib/spawn.ts (spawnArgv / withSpawned). The canonical helper preserves NODE_V8_COVERAGE inheritance for subprocess coverage capture.',
          },
        ],
      }],
    },
  },
```

(The `ignores` list permits the canonical helper itself and two specific call sites that legitimately need raw spawn: `pnpm-process.ts` for the `runPnpm` wrapper, and `gauntlet.ts` for orchestrating gauntlet phase spawns. Both predate this work and have alternative drift guards.)

- [ ] **Step 13.2: Extend the lint script in package.json**

Edit `package.json`. Find the `"lint"` script and replace it:

```json
"lint": "eslint --max-warnings 0 'packages/*/src/**/*.ts' 'tests/**/*.ts' 'scripts/**/*.ts'",
```

- [ ] **Step 13.3: Run lint and confirm the rule fires correctly**

Run: `pnpm lint`

Expected: PASS — the only files that import `node:child_process` are `scripts/lib/spawn.ts`, `scripts/support/pnpm-process.ts`, `scripts/gauntlet.ts`, and any others on the ignore list. If lint surfaces additional violations that are legitimate (e.g. another script that spawns), add them to the `ignores` list with a one-line comment explaining why. If lint surfaces test files that didn't get migrated in earlier tasks, fix them now by routing through `scripts/lib/spawn.ts`.

- [ ] **Step 13.4: Commit**

```bash
git add eslint.config.js package.json
git commit -m "$(cat <<'EOF'
ci(lint): ban raw child_process imports outside scripts/lib/spawn.ts

no-restricted-imports rule scoped to packages/, tests/, scripts/. Lint
script extended to cover tests/ and scripts/ so the rule has teeth.
Permitted call sites: scripts/lib/spawn.ts itself,
scripts/support/pnpm-process.ts (runPnpm wrapper), scripts/gauntlet.ts
(phase orchestration).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Drift guard — `tests/unit/meta/spawn-coverage-inheritance.test.ts`

**Files:**
- Create: `tests/unit/meta/spawn-coverage-inheritance.test.ts`

- [ ] **Step 14.1: Write the test**

Create `tests/unit/meta/spawn-coverage-inheritance.test.ts`:

```ts
/**
 * Drift guard — asserts scripts/lib/spawn.ts preserves NODE_V8_COVERAGE
 * (and process.env in general) when spawning children.
 *
 * If a future commit adds an `env: { ... }` override to spawnArgv or
 * startSpawn, this test fails immediately. Subprocess coverage capture
 * depends on uninterrupted env inheritance.
 *
 * @module
 */

import { describe, it, expect } from 'vitest';
import { spawnArgv } from '../../../scripts/lib/spawn.js';

describe('spawn coverage inheritance', () => {
  it('children inherit NODE_V8_COVERAGE from parent', async () => {
    process.env.CZAP_TEST_SENTINEL = 'inheritance-marker-7331';
    try {
      const result = await spawnArgv(
        'node',
        ['-e', 'process.stderr.write(process.env.CZAP_TEST_SENTINEL ?? "MISSING")'],
        { stdio: ['ignore', 'ignore', 'pipe'] },
      );
      expect(result.exitCode).toBe(0);
      expect(result.stderrTail).toContain('inheritance-marker-7331');
    } finally {
      delete process.env.CZAP_TEST_SENTINEL;
    }
  });

  it('children inherit NODE_V8_COVERAGE specifically when set', async () => {
    process.env.NODE_V8_COVERAGE = '/tmp/_czap-test-cov-marker';
    try {
      const result = await spawnArgv(
        'node',
        ['-e', 'process.stderr.write(process.env.NODE_V8_COVERAGE ?? "MISSING")'],
        { stdio: ['ignore', 'ignore', 'pipe'] },
      );
      expect(result.exitCode).toBe(0);
      expect(result.stderrTail).toContain('/tmp/_czap-test-cov-marker');
    } finally {
      delete process.env.NODE_V8_COVERAGE;
    }
  });
});
```

- [ ] **Step 14.2: Run the drift guard**

Run: `pnpm test tests/unit/meta/spawn-coverage-inheritance.test.ts`

Expected: PASS — children see the parent's env in both cases.

- [ ] **Step 14.3: Commit**

```bash
git add tests/unit/meta/spawn-coverage-inheritance.test.ts
git commit -m "$(cat <<'EOF'
test(meta): drift guard for spawn env inheritance

Asserts scripts/lib/spawn.ts preserves process.env (specifically
NODE_V8_COVERAGE) when spawning children. Any future commit that
adds an env: {...} override breaks this test immediately.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Config drift guard — `tests/unit/meta/coverage-config.test.ts`

**Files:**
- Create: `tests/unit/meta/coverage-config.test.ts`

- [ ] **Step 15.1: Write the test**

Create `tests/unit/meta/coverage-config.test.ts`:

```ts
/**
 * Drift guard — asserts coverage gate config has not been silently
 * lowered. Tracks two structural invariants from the subprocess-coverage
 * spec (docs/superpowers/specs/2026-04-25-subprocess-coverage-design.md):
 *
 *   1. vitest.shared.ts coverageExclude length unchanged.
 *   2. scripts/merge-coverage.ts PACKAGE_THRESHOLD_OVERRIDES exact values.
 *
 * If the gate genuinely needs to change, update the expected values here
 * in the same commit — that surfaces the change in code review instead of
 * letting it slip through.
 *
 * @module
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { coverageExclude } from '../../../vitest.shared.js';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');

describe('coverage config drift guard', () => {
  it('coverageExclude has expected size (no silent additions)', () => {
    expect(coverageExclude).toHaveLength(8);
  });

  it('merge-coverage.ts PACKAGE_THRESHOLD_OVERRIDES are pinned', () => {
    const src = readFileSync(resolve(REPO_ROOT, 'scripts', 'merge-coverage.ts'), 'utf8');
    const block = src.match(
      /const PACKAGE_THRESHOLD_OVERRIDES[\s\S]*?\};/,
    )?.[0];
    expect(block).toBeDefined();
    expect(block).toContain("core: {");
    expect(block).toContain("functions: 97");
    expect(block).toContain("web: {");
    // Ensure both core and web functions: 97 overrides are present.
    const ninetySevenCount = (block!.match(/functions: 97/g) ?? []).length;
    expect(ninetySevenCount).toBe(2);
  });

  it('merge-coverage.ts TOTAL_THRESHOLDS are pinned', () => {
    const src = readFileSync(resolve(REPO_ROOT, 'scripts', 'merge-coverage.ts'), 'utf8');
    expect(src).toMatch(/const TOTAL_THRESHOLDS[\s\S]*?lines: 90/);
    expect(src).toMatch(/const TOTAL_THRESHOLDS[\s\S]*?statements: 90/);
    expect(src).toMatch(/const TOTAL_THRESHOLDS[\s\S]*?functions: 90/);
    expect(src).toMatch(/const TOTAL_THRESHOLDS[\s\S]*?branches: 80/);
  });

  it('merge-coverage.ts PACKAGE_THRESHOLDS are pinned', () => {
    const src = readFileSync(resolve(REPO_ROOT, 'scripts', 'merge-coverage.ts'), 'utf8');
    expect(src).toMatch(/const PACKAGE_THRESHOLDS[\s\S]*?lines: 85/);
    expect(src).toMatch(/const PACKAGE_THRESHOLDS[\s\S]*?statements: 85/);
    expect(src).toMatch(/const PACKAGE_THRESHOLDS[\s\S]*?functions: 85/);
    expect(src).toMatch(/const PACKAGE_THRESHOLDS[\s\S]*?branches: 75/);
  });
});
```

- [ ] **Step 15.2: Run the test**

Run: `pnpm test tests/unit/meta/coverage-config.test.ts`

Expected: PASS — current config matches.

- [ ] **Step 15.3: Commit**

```bash
git add tests/unit/meta/coverage-config.test.ts
git commit -m "$(cat <<'EOF'
test(meta): drift guard for coverage gate config

Asserts coverageExclude length and merge-coverage.ts threshold blocks
unchanged. Future changes must update the expected values in the same
commit, surfacing in review.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: c8 ignore budget guard — `tests/unit/meta/c8-ignore-budget.test.ts`

**Files:**
- Create: `tests/unit/meta/c8-ignore-budget.test.ts`

- [ ] **Step 16.1: Write the test**

Create `tests/unit/meta/c8-ignore-budget.test.ts`:

```ts
/**
 * Budget guard — caps `/* c8 ignore` annotations across the repo at 5.
 *
 * The subprocess-coverage spec allows narrow `c8 ignore` comments only on
 * genuinely unreachable defensive branches. Each must include a one-line
 * `// reason: ...` rationale. Bumping this budget requires explicit code
 * review — silent additions fail this test.
 *
 * @module
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import fg from 'fast-glob';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const C8_IGNORE_BUDGET = 5;

describe('c8 ignore budget', () => {
  it(`repo has at most ${C8_IGNORE_BUDGET} c8 ignore annotations`, () => {
    const files = fg.sync(
      ['packages/*/src/**/*.ts', 'scripts/**/*.ts'],
      { cwd: REPO_ROOT, absolute: true, onlyFiles: true },
    );
    const offenders: { file: string; count: number }[] = [];
    let total = 0;
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      const matches = src.match(/\/\*\s*c8\s+ignore/g);
      if (matches && matches.length > 0) {
        offenders.push({ file: file.replace(REPO_ROOT, ''), count: matches.length });
        total += matches.length;
      }
    }
    if (total > C8_IGNORE_BUDGET) {
      console.error('c8 ignore offenders:', offenders);
    }
    expect(total).toBeLessThanOrEqual(C8_IGNORE_BUDGET);
  });
});
```

- [ ] **Step 16.2: Run the test**

Run: `pnpm test tests/unit/meta/c8-ignore-budget.test.ts`

Expected: PASS — current count is 0 (well under budget).

- [ ] **Step 16.3: Commit**

```bash
git add tests/unit/meta/c8-ignore-budget.test.ts
git commit -m "$(cat <<'EOF'
test(meta): cap c8 ignore annotations at 5 across repo

Subprocess-coverage spec restricts c8 ignore to genuinely unreachable
defensive branches with one-line rationale. Budget guard fails CI if
total exceeds 5.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 17: Track C audit — list uncovered functions in core / web / remotion

**Files:**
- Create: `scripts/audit/uncovered-functions.ts`

- [ ] **Step 17.1: Confirm latest coverage exists**

Run: `pnpm coverage:node`

Expected: writes `coverage/node/coverage-final.json`. (After Task 8/12 the gap-file files should be ≥95%; after Tracks A+B subprocess coverage flows through.)

- [ ] **Step 17.2: Write the audit script**

Create `scripts/audit/uncovered-functions.ts`:

```ts
/**
 * Audit script — lists every function with hit count 0 in the core, web,
 * and remotion packages, with file:line and function name. Used during
 * Track C cleanup to identify what to test.
 *
 * Deleted in Task 21 after the borderline cleanup is complete.
 *
 * @module
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');
const COVERAGE_PATH = resolve(REPO_ROOT, 'coverage', 'coverage-final.json');

if (!existsSync(COVERAGE_PATH)) {
  console.error(`Missing ${COVERAGE_PATH} — run pnpm coverage:merge first.`);
  process.exit(1);
}

interface FileCoverage {
  path: string;
  fnMap: Record<string, { name: string; line: number; loc?: { start: { line: number } } }>;
  f: Record<string, number>;
  statementMap?: Record<string, { start: { line: number } }>;
  s?: Record<string, number>;
}

const data = JSON.parse(readFileSync(COVERAGE_PATH, 'utf8')) as Record<string, FileCoverage>;

const TARGET_PACKAGES = ['core', 'web', 'remotion'] as const;

interface Uncovered {
  package: string;
  file: string;
  line: number;
  name: string;
  kind: 'function' | 'statement';
}

const uncovered: Uncovered[] = [];

for (const [filePath, fileCoverage] of Object.entries(data)) {
  const m = filePath.replace(/\\/g, '/').match(/packages\/([^/]+)\/src\//);
  if (!m) continue;
  const packageName = m[1];
  if (!TARGET_PACKAGES.includes(packageName as typeof TARGET_PACKAGES[number])) continue;

  const relPath = filePath.replace(/\\/g, '/').replace(/^.*?packages\//, 'packages/');

  for (const [fnId, hits] of Object.entries(fileCoverage.f ?? {})) {
    if (hits === 0) {
      const fn = fileCoverage.fnMap[fnId];
      if (fn) {
        uncovered.push({
          package: packageName,
          file: relPath,
          line: fn.loc?.start.line ?? fn.line,
          name: fn.name || '<anonymous>',
          kind: 'function',
        });
      }
    }
  }

  // Also surface uncovered statements when the function gate is met but the
  // statement gate isn't (e.g. remotion).
  if (packageName === 'remotion') {
    for (const [stmtId, hits] of Object.entries(fileCoverage.s ?? {})) {
      if (hits === 0) {
        const stmt = fileCoverage.statementMap?.[stmtId];
        if (stmt) {
          uncovered.push({
            package: packageName,
            file: relPath,
            line: stmt.start.line,
            name: '<statement>',
            kind: 'statement',
          });
        }
      }
    }
  }
}

uncovered.sort((a, b) => {
  if (a.package !== b.package) return a.package.localeCompare(b.package);
  if (a.file !== b.file) return a.file.localeCompare(b.file);
  return a.line - b.line;
});

console.log(`Found ${uncovered.length} uncovered ${TARGET_PACKAGES.join(' / ')} entries:\n`);
for (const u of uncovered) {
  console.log(`  [${u.package}] ${u.file}:${u.line}  (${u.kind}) ${u.name}`);
}
```

- [ ] **Step 17.3: Run the audit**

Run: `pnpm exec tsx scripts/audit/uncovered-functions.ts`

Expected output: a list of `[package] file:line (kind) name` entries. Save the output — Tasks 18, 19, 20 work through them.

- [ ] **Step 17.4: Commit**

```bash
git add scripts/audit/uncovered-functions.ts
git commit -m "$(cat <<'EOF'
chore(audit): uncovered-functions lister for Track C cleanup

Deleted in Task 21 after borderline misses are closed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 18: Close core uncovered functions to ≥97%

**Files:**
- Create as needed: new `tests/unit/core/<file>.test.ts` files alongside existing tests, OR extend existing ones.
- Possible: minor refactors in `packages/core/src/*.ts` if a function is genuinely dead.
- Possible: up to a small number of `/* c8 ignore next */` annotations (counts toward Task 16's budget of 5 across the whole repo).

This task is mechanical and audit-driven. The exact files depend on the Task 17 output.

- [ ] **Step 18.1: For each uncovered function in core, decide a resolution**

For each entry in the Task 17 output where `package === 'core'`:

1. Open the source file at the listed line. Read the function signature and 5–10 lines of context.
2. Decide one of three resolutions:
   - **(A) Add a test.** Preferred when the function is reachable through a documented API. Find or create the corresponding `tests/unit/core/<module>.test.ts` and add a focused test asserting the function's behavior with one realistic input and one edge case.
   - **(B) Refactor.** When the function is dead code (e.g. unused export, unreachable branch). Delete the dead path. Run `pnpm test` to confirm nothing depends on it.
   - **(C) Annotate.** Only when the function exists for defensive purposes against an impossible state (e.g. exhaustiveness fall-through that TypeScript already proves unreachable). Wrap with `/* c8 ignore next */` and add `// reason: <one-line rationale>` immediately above. Counts toward the c8-ignore budget (Task 16).
3. After each resolution, run `pnpm test` for the affected file to confirm green.
4. Commit per logical group of functions (one commit per source file is a fine granularity).

Example commit message format for (A):

```bash
git add tests/unit/core/<module>.test.ts
git commit -m "$(cat <<'EOF'
test(core): cover <function-name> in <file>

Track C cleanup — lifts core funcs toward 97% gate.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 18.2: Re-run audit + coverage merge**

After all core entries resolved:

```bash
pnpm coverage:node
pnpm coverage:browser
pnpm exec tsx scripts/merge-coverage.ts 2>&1 | tee /tmp/coverage-out.txt || true
grep '^  core' /tmp/coverage-out.txt
```

Expected: `core` functions line shows ≥97%.

If still below 97%: re-run the audit and resolve remaining entries.

- [ ] **Step 18.3: Commit any final pieces**

If pieces were committed throughout 18.1, this step may be a no-op. Otherwise:

```bash
git add packages/core/src tests/unit/core
git commit -m "$(cat <<'EOF'
test(core): close remaining uncovered functions to clear 97% gate

Track C cleanup complete for core package.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 19: Close web uncovered functions to ≥97%

**Files:**
- Create as needed: `tests/unit/web/<file>.test.ts` files.
- Possible: refactors in `packages/web/src/*.ts`.
- Possible: c8 ignore annotations (shared budget with Task 18).

- [ ] **Step 19.1: For each uncovered function in web, decide a resolution**

Same workflow as Task 18 (A / B / C), targeting entries where `package === 'web'`. Likely focus areas based on the pre-spec audit:

- `web/src/stream/sse.ts` (91.3% functions)
- `web/src/stream/resumption.ts` (85.71% functions)
- `web/src/capsules/stream-receipt.ts` (0% functions)

For `stream-receipt.ts` specifically: this is a capsule file that may need a generated-test harness rather than a hand-written one. Check `tests/unit/web/capsules/stream-receipt-capsule.test.ts` (which already exists) to see if extending its coverage is the right path, or whether the capsule's `run` handler needs to be defined in its source.

Commit per source-file group as in Task 18.

- [ ] **Step 19.2: Verify gate**

```bash
pnpm coverage:node && pnpm coverage:browser
pnpm exec tsx scripts/merge-coverage.ts 2>&1 | tee /tmp/coverage-out.txt || true
grep '^  web' /tmp/coverage-out.txt
```

Expected: `web` functions ≥97%.

- [ ] **Step 19.3: Commit if anything outstanding**

```bash
git add packages/web/src tests/unit/web
git commit -m "$(cat <<'EOF'
test(web): close remaining uncovered functions to clear 97% gate

Track C cleanup complete for web package.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 20: Close remotion borderline to ≥85% statements

**Files:**
- Create as needed: `tests/unit/remotion/<file>.test.ts` files or extend existing.
- Possible: refactors in `packages/remotion/src/*.ts`.

- [ ] **Step 20.1: For each uncovered statement / function in remotion, decide a resolution**

Same A / B / C workflow as Tasks 18–19. Likely focus areas:

- `remotion/src/composition.ts` line 8 (single uncovered statement — likely an export type or import path)
- `remotion/src/capsules/remotion-adapter.ts` 50% — needs the capsule's `run` handler defined or the existing test extended

- [ ] **Step 20.2: Verify gate**

```bash
pnpm coverage:node && pnpm coverage:browser
pnpm exec tsx scripts/merge-coverage.ts 2>&1 | tee /tmp/coverage-out.txt || true
grep '^  remotion' /tmp/coverage-out.txt
```

Expected: `remotion` statements ≥85%.

- [ ] **Step 20.3: Commit**

```bash
git add packages/remotion/src tests/unit/remotion
git commit -m "$(cat <<'EOF'
test(remotion): close remaining uncovered statements to clear 85% gate

Track C cleanup complete for remotion package.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 21: Delete the spike + audit script

**Files:**
- Delete: `tests/scratch/spike-subprocess-coverage.test.ts`
- Delete: `scripts/audit/uncovered-functions.ts`
- Modify: `vitest.shared.ts` (remove `'tests/scratch/**/*.test.ts'` from `nodeTestInclude`)
- Possibly delete: `tests/scratch/` directory if empty after removing spike.

- [ ] **Step 21.1: Delete the spike file**

```bash
rm tests/scratch/spike-subprocess-coverage.test.ts
rmdir tests/scratch 2>/dev/null || true
```

- [ ] **Step 21.2: Revert `nodeTestInclude` change from Task 1.1**

Edit `vitest.shared.ts`. Remove the `'tests/scratch/**/*.test.ts'` entry from the `nodeTestInclude` array, restoring the original list.

- [ ] **Step 21.3: Delete the audit script**

```bash
rm scripts/audit/uncovered-functions.ts
```

- [ ] **Step 21.4: Run typecheck and tests to confirm cleanup didn't break anything**

```bash
pnpm typecheck && pnpm test
```

Expected: PASS — nothing imports the deleted files.

- [ ] **Step 21.5: Commit**

```bash
git add -u
git commit -m "$(cat <<'EOF'
chore: delete subprocess-coverage spike and Track C audit script

Both were one-shot tools. Spike outcome documented in plan Step 1.4;
audit fed Tasks 18-20. nodeTestInclude reverted to remove
tests/scratch glob.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 22: Final acceptance — `pnpm gauntlet:full` from clean state

**Files:**
- None modified (verification step).

- [ ] **Step 22.1: Confirm working tree is clean**

```bash
git status
```

Expected: `nothing to commit, working tree clean`.

- [ ] **Step 22.2: Wipe coverage caches**

```bash
rm -rf coverage/ node_modules/.vite-browser
```

- [ ] **Step 22.3: Run the full gauntlet**

```bash
pnpm gauntlet:full
```

Expected: exit code 0. The gauntlet output should end with:

```
============================================================
  GAUNTLET PASSED
============================================================
```

If any phase fails:
- **build / typecheck / lint** — fix the regression at the failure point.
- **test** — re-run the failing test in isolation: `pnpm test <path>`. Likely a timing or env issue introduced in this branch.
- **coverage:merge** — read the per-package output. If a package is below threshold, run the audit again (`pnpm exec tsx scripts/audit/uncovered-functions.ts` — wait, that's deleted; recreate from git history if needed) or use `node -e "..."` snippets to find the regression.
- **flex:verify** — orthogonal to this work; investigate independently.

- [ ] **Step 22.4: Commit any residual fixes**

If iterations were needed in 22.3, commit each fix in its own logical commit before declaring done.

- [ ] **Step 22.5: Final commit closing the spec**

```bash
git commit --allow-empty -m "$(cat <<'EOF'
chore: subprocess coverage spec landed — gauntlet:full green

Acceptance criteria from docs/superpowers/specs/2026-04-25-subprocess-coverage-design.md
all met:
- pnpm gauntlet:full exits 0 from clean state
- coverageExclude unchanged (8 entries)
- TOTAL_THRESHOLDS / PACKAGE_THRESHOLDS / overrides unchanged
- /* c8 ignore */ count <=5 across repo
- Subprocess coverage flows through scripts/lib/spawn.ts: parent
  vitest sets NODE_V8_COVERAGE via cross-env, helper preserves env so
  children inherit, merge-subprocess-v8.ts converts raw v8 dumps
  via v8-to-istanbul and unions into coverage-final.json before the
  existing merge-coverage.ts gate.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Spec Self-Review Checklist (filled in during plan writing)

- ✅ **Spec coverage:** Track A (Tasks 1–6 + 14), Track B (Tasks 7–12), Track C (Tasks 17–20), drift guards (Tasks 13–16), final gate (Task 22). Every spec section maps to at least one task.
- ✅ **Placeholder scan:** No "TBD" / "TODO" / "implement later". Track C tasks (18–20) deliberately don't enumerate every individual function because the audit (Task 17) determines them at execution time — but each of those tasks specifies the per-function decision algorithm explicitly.
- ✅ **Type consistency:** `SpawnHandle.dispose()` referenced consistently across Tasks 2, 6, 8, 9, 12. `quoteWindowsArg` signature consistent in Tasks 2, 3, 4, 5. `withSpawned<T>` generic preserved through call sites.

## Spike Results

❌ **Need fallback — adding `scripts/merge-subprocess-v8.ts` task before Task 2.**

### What was observed

Two runs of `pnpm coverage:node` (with `--coverage.reportOnFailure` to defeat one pre-existing flaky test in `tests/integration/cli/scene-render.test.ts` that was suppressing report writes):

1. **Full suite run** — `coverage/node/coverage-final.json` shows `packages/cli/src/dispatch.ts` with non-zero counts (`s.0=28, s.1=28, ...`). However, this is a **false positive**: in-process integration tests in `tests/integration/cli/*.test.ts` already exercise `dispatch.ts` via `import { run } from '@czap/cli'`. Cannot disambiguate grandchild contribution from in-process coverage.

2. **Spike-only run** (`pnpm exec vitest run --config vitest.config.ts --coverage --coverage.reportOnFailure tests/scratch/spike-subprocess-coverage.test.ts`) — `packages/cli/src/dispatch.ts` shows **ALL ZEROS** (`s.0=0, s.1=0, ..., s.53=0`). The spike test itself passed (subprocess spawned and exited 0), so the grandchild definitely imported `dispatch.ts`. Yet zero coverage was captured. This is the diagnostic signal: subprocess coverage does NOT flow through.

### Root cause

Vitest 4's `@vitest/coverage-v8` provider does NOT use `NODE_V8_COVERAGE` env-var inheritance. It uses Node's `inspector.Session` Profiler API in-process:

```js
// node_modules/.pnpm/@vitest+coverage-v8@4.1.2.../dist/index.js
import inspector from 'node:inspector/promises';
const session = new inspector.Session();
// ...
await session.post('Profiler.startPreciseCoverage', { callCount: true, detailed: true });
// later:
const coverage = await session.post('Profiler.takePreciseCoverage');
```

Each V8 isolate has its own inspector state. When vitest workers spawn grandchildren, those grandchildren run in a fresh isolate without an inspector session attached, so their precise-coverage data is never collected. There is no `NODE_V8_COVERAGE` env-var being set on workers (verified: `grep -r NODE_V8_COVERAGE node_modules/` returns no matches in vitest packages).

### Required fallback

A `scripts/merge-subprocess-v8.ts` step is necessary. Approach:

1. Set `NODE_V8_COVERAGE` ourselves in the test runner env (e.g., wrap `coverage:node` to export a temp dir, or set per-spawn via `withSpawned`).
2. After vitest exits, walk that temp dir for `coverage-*.json` v8 dump files (one per child process that ran with `NODE_V8_COVERAGE` set).
3. Convert v8 → istanbul via `c8 report --reporter=json` or `v8-to-istanbul`, merge into `coverage/node/coverage-final.json` using `istanbul-lib-coverage`.
4. Wire into `coverage:merge` script before the final `tsx scripts/merge-coverage.ts` step.

A subtlety: setting `NODE_V8_COVERAGE` only catches subprocesses we explicitly spawn. The vitest worker itself won't dump there (since it uses inspector instead). So the merge needs to UNION (vitest's coverage-final.json) ∪ (NODE_V8_COVERAGE dumps from our spawns) — which is exactly the istanbul merge `c.merge(d)` semantics.

Recommend updating Task 2 (`scripts/lib/spawn.ts`) to also propagate a `NODE_V8_COVERAGE` env var pointing to a per-test-run temp dir so dumps land somewhere predictable, and inserting Task 1.5 to author `scripts/merge-subprocess-v8.ts` before proceeding to Task 2.
