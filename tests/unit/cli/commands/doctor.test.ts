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
