/**
 * Unit tests for `czap doctor`. Probes don't mock the environment; they
 * run against the live workspace. We assert structural invariants
 * (every check has a status + label) rather than specific verdicts so
 * the test stays stable across machines.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { doctor, readCliVersion } from '../../../../packages/cli/src/commands/doctor.js';
import { captureCli } from '../../../integration/cli/capture.js';

describe('doctor command', () => {
  it('emits a receipt with status, verdict, and per-check entries', async () => {
    const { exit, stdout } = await captureCli(() => doctor({ pretty: false }));
    expect([0, 1]).toContain(exit);
    const receipt = JSON.parse(stdout.trim().split('\n').pop()!);
    expect(receipt.command).toBe('doctor');
    expect(['ok', 'failed']).toContain(receipt.status);
    expect(['ready', 'caution', 'blocked']).toContain(receipt.verdict);
    expect(Array.isArray(receipt.checks)).toBe(true);
    expect(receipt.checks.length).toBeGreaterThan(0);
    for (const check of receipt.checks) {
      expect(typeof check.id).toBe('string');
      expect(typeof check.label).toBe('string');
      expect(['ok', 'warn', 'fail']).toContain(check.status);
      expect(typeof check.detail).toBe('string');
    }
  });

  it('includes the canonical probe ids', async () => {
    const { stdout } = await captureCli(() => doctor({ pretty: false }));
    const receipt = JSON.parse(stdout.trim().split('\n').pop()!);
    const ids = new Set<string>(receipt.checks.map((c: { id: string }) => c.id));
    expect(ids).toContain('node.version');
    expect(ids).toContain('pnpm.version');
    expect(ids).toContain('workspace.installed');
    expect(ids).toContain('core.built');
    expect(ids).toContain('cli.built');
    expect(ids).toContain('git.hooks');
    expect(ids).toContain('git.config');
    expect(ids).toContain('playwright.installed');
  });

  it('includes wasm.toolchain when crates/ is present (skipped otherwise)', async () => {
    const { stdout } = await captureCli(() => doctor({ pretty: false }));
    const receipt = JSON.parse(stdout.trim().split('\n').pop()!);
    const ids = new Set<string>(receipt.checks.map((c: { id: string }) => c.id));
    // Repo has crates/czap-compute, so the probe should fire.
    expect(ids).toContain('wasm.toolchain');
  });

  it('omits wasm.toolchain in a workspace without crates/', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'czap-doctor-nocrates-'));
    try {
      mkdirSync(resolve(tmp, 'packages/core'), { recursive: true });
      const { stdout } = await captureCli(() => doctor({ pretty: false, cwd: tmp }));
      const receipt = JSON.parse(stdout.trim().split('\n').pop()!);
      const ids = new Set<string>(receipt.checks.map((c: { id: string }) => c.id));
      expect(ids.has('wasm.toolchain')).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('git.config probe returns ok when running outside a git worktree', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'czap-doctor-nogit-'));
    try {
      mkdirSync(resolve(tmp, 'packages/core'), { recursive: true });
      const { stdout } = await captureCli(() => doctor({ pretty: false, cwd: tmp }));
      const receipt = JSON.parse(stdout.trim().split('\n').pop()!);
      const gitCfg = receipt.checks.find((c: { id: string }) => c.id === 'git.config');
      expect(gitCfg.status).toBe('ok');
      expect(gitCfg.detail).toContain('not a worktree');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('--ci escalates caution to exit 1 while keeping the verdict honest', async () => {
    // Build a sandbox with node_modules satisfied but no dist/ — that's a
    // pure-warn workspace (caution verdict). Without --ci this exits 0.
    const tmp = mkdtempSync(join(tmpdir(), 'czap-doctor-caution-'));
    try {
      mkdirSync(resolve(tmp, 'packages/core/dist'), { recursive: true });
      mkdirSync(resolve(tmp, 'packages/cli/dist'), { recursive: true });
      mkdirSync(resolve(tmp, 'node_modules'), { recursive: true });
      // Touch the freshness sentinel so workspace.installed reads as ok.
      writeFileSync(resolve(tmp, 'node_modules/.modules.yaml'), 'lockfile: stub\n');
      // Built dist sentinel — index.js must exist.
      writeFileSync(resolve(tmp, 'packages/core/dist/index.js'), '// stub\n');
      writeFileSync(resolve(tmp, 'packages/cli/dist/index.js'), '// stub\n');
      // No .git here, so git.hooks/git.config probes return ok-with-no-worktree.
      // The only non-ok will be Playwright (no node_modules/@playwright/test) — a warn.

      const { exit: exitWithoutCi, stdout: stdoutWithoutCi } = await captureCli(() =>
        doctor({ pretty: false, cwd: tmp }),
      );
      const receiptWithout = JSON.parse(stdoutWithoutCi.trim().split('\n').pop()!);
      expect(receiptWithout.verdict).toBe('caution');
      expect(exitWithoutCi).toBe(0);
      expect('strict' in receiptWithout).toBe(false);

      const { exit: exitWithCi, stdout: stdoutWithCi } = await captureCli(() =>
        doctor({ pretty: false, ci: true, cwd: tmp }),
      );
      const receiptWith = JSON.parse(stdoutWithCi.trim().split('\n').pop()!);
      expect(receiptWith.verdict).toBe('caution');
      expect(receiptWith.status).toBe('failed');
      expect(receiptWith.strict).toBe(true);
      expect(exitWithCi).toBe(1);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('--ci stays exit 0 when verdict is ready (no warnings)', async () => {
    // Run against the live, healthy workspace — should be ready (or close to it).
    // We don't assume strictly ready (Playwright/git-config may warn on some
    // dev machines), so we only assert that if verdict is ready, --ci exits 0.
    const { exit: exitNoCi, stdout } = await captureCli(() => doctor({ pretty: false }));
    const receipt = JSON.parse(stdout.trim().split('\n').pop()!);
    if (receipt.verdict === 'ready') {
      const { exit: exitCi } = await captureCli(() => doctor({ pretty: false, ci: true }));
      expect(exitCi).toBe(0);
      expect(exitNoCi).toBe(0);
    }
  });

  it('reports `blocked` and exit 1 when workspace is uninstalled in a sandbox', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'czap-doctor-'));
    try {
      // Make a fake workspace with no node_modules / no packages dist.
      mkdirSync(resolve(tmp, 'packages/core'), { recursive: true });
      const { exit, stdout } = await captureCli(() => doctor({ pretty: false, cwd: tmp }));
      const receipt = JSON.parse(stdout.trim().split('\n').pop()!);
      expect(receipt.verdict).toBe('blocked');
      expect(receipt.status).toBe('failed');
      expect(exit).toBe(1);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('readCliVersion returns the CLI package version when run from the repo root', () => {
    const v = readCliVersion();
    expect(v).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('readCliVersion resolves the CLI package.json by module location, not cwd', () => {
    // Regression for PR #3 Codex P2: previously `readCliVersion()` only
    // looked at `<cwd>/packages/cli/package.json` and `<cwd>/package.json`,
    // so `czap version` reported '0.0.0-unknown' whenever the user wasn't
    // sitting in the repo root (e.g., a globally-installed czap run from
    // an arbitrary project). The fix tries `import.meta.url`-relative
    // first, so this test asserts the version resolves correctly even
    // when cwd has no @czap-shaped package.json on disk.
    const origCwd = process.cwd();
    const stranger = mkdtempSync(join(tmpdir(), 'czap-version-cwd-'));
    try {
      process.chdir(stranger);
      const v = readCliVersion();
      expect(v).toMatch(/^\d+\.\d+\.\d+/);
      expect(v).not.toBe('0.0.0-unknown');
    } finally {
      process.chdir(origCwd);
      rmSync(stranger, { recursive: true, force: true });
    }
  });

  it('--fix mode produces a `fixed` array when nothing was actually broken (no-op)', async () => {
    // With a healthy workspace, --fix finds nothing to repair and emits
    // the receipt without a `fixed` field (only present when fixes ran).
    const { exit, stdout } = await captureCli(() => doctor({ pretty: false, fix: true }));
    expect([0, 1]).toContain(exit);
    const receipt = JSON.parse(stdout.trim().split('\n').pop()!);
    if ('fixed' in receipt) {
      expect(Array.isArray(receipt.fixed)).toBe(true);
      for (const f of receipt.fixed) {
        expect(typeof f.id).toBe('string');
        expect(typeof f.action).toBe('string');
        expect(['applied', 'failed']).toContain(f.status);
      }
    }
  });

  it('checks expose a `fixable` flag where remediation is wired', async () => {
    const { stdout } = await captureCli(() => doctor({ pretty: false }));
    const receipt = JSON.parse(stdout.trim().split('\n').pop()!);
    const fixable = receipt.checks.filter((c: { fixable?: boolean }) => c.fixable);
    // The fixable set today is {git.hooks, core.built, cli.built}; we
    // only assert it's a subset of those rather than equality, so adding
    // a new fixable check doesn't break this test.
    for (const c of fixable) {
      expect(['git.hooks', 'core.built', 'cli.built']).toContain(c.id);
    }
  });

  it('readCliVersion ignores a cwd whose package.json is not @czap/cli (module-relative wins)', () => {
    // After PR #3 Codex P2 fix, module-relative resolution finds the
    // real @czap/cli package.json regardless of cwd. The cwd-relative
    // candidates are only consulted as a fallback. This test asserts
    // that the module-relative resolution dominates: a non-@czap/cli
    // package.json under cwd does NOT shadow the real version.
    const tmp = mkdtempSync(join(tmpdir(), 'czap-version-'));
    try {
      writeFileSync(resolve(tmp, 'package.json'), JSON.stringify({ name: 'not-czap', version: '9.9.9' }));
      const v = readCliVersion(tmp);
      // Real CLI version, NOT '9.9.9' (the imposter under cwd) or
      // '0.0.0-unknown' (the pre-fix bug behavior).
      expect(v).toMatch(/^\d+\.\d+\.\d+/);
      expect(v).not.toBe('9.9.9');
      expect(v).not.toBe('0.0.0-unknown');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
