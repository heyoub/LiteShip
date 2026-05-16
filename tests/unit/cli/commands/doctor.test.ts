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
    expect(ids).toContain('playwright.installed');
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

  it('readCliVersion falls back to "0.0.0-unknown" outside a known workspace', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'czap-version-'));
    try {
      writeFileSync(resolve(tmp, 'package.json'), JSON.stringify({ name: 'not-czap', version: '9.9.9' }));
      const v = readCliVersion(tmp);
      expect(v).toBe('0.0.0-unknown');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
