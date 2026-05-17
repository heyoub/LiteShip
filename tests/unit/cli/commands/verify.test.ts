/**
 * Smoke tests for `czap verify`. Lives alongside the other CLI verb tests
 * so the canonical layout matches the CLI verb table. Deep verdict
 * coverage (Verified / Mismatch / Incomplete / Unknown end-to-end with a
 * real packed tarball and synthesized capsules) lives in
 * tests/unit/ship-verify-verdicts.test.ts; this file just confirms the
 * Unknown-verdict exit path and receipt shape from ADR-0011.
 */
import { describe, it, expect } from 'vitest';
import { verify } from '../../../../packages/cli/src/commands/ship-verify.js';
import { captureCli } from '../../../integration/cli/capture.js';

describe('verify command (smoke)', () => {
  it('is importable and returns a numeric exit code', async () => {
    expect(typeof verify).toBe('function');
    const { exit } = await captureCli(() => verify([]));
    expect(typeof exit).toBe('number');
  });

  it('returns Unknown (exit 4) when no args are given', async () => {
    const { exit } = await captureCli(() => verify([]));
    expect(exit).toBe(4);
  });

  it('emits a receipt with command=verify and status=failed for the Unknown path', async () => {
    const { stdout } = await captureCli(() => verify([]));
    const receipt = JSON.parse(stdout.trim().split('\n').pop()!) as {
      command: string;
      status: string;
      verdict: string;
      capsule_id: unknown;
      checks: { tarball_manifest: string };
    };
    expect(receipt.command).toBe('verify');
    expect(receipt.status).toBe('failed');
    expect(receipt.verdict).toBe('Unknown');
    expect(receipt.capsule_id).toBeNull();
    expect(receipt.checks.tarball_manifest).toBe('skipped');
  });

  it('still returns Unknown (exit 4) when a tarball positional is given but no --capsule', async () => {
    const { exit, stdout } = await captureCli(() => verify(['/nonexistent/path.tgz']));
    expect(exit).toBe(4);
    const receipt = JSON.parse(stdout.trim().split('\n').pop()!) as { verdict: string; tarball: string };
    expect(receipt.verdict).toBe('Unknown');
    expect(receipt.tarball).toBe('/nonexistent/path.tgz');
  });
});
