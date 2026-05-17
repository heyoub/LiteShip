/**
 * Unit tests for `czap version`. Emits a JSON receipt with czap, Node,
 * and (best-effort) pnpm versions.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { version } from '../../../../packages/cli/src/commands/version.js';
import { captureCli } from '../../../integration/cli/capture.js';

describe('version command', () => {
  afterEach(() => {
    // Any test in this file that calls vi.stubEnv(...) gets a guaranteed
    // restore. Idempotent: a no-op for tests that didn't stub.
    vi.unstubAllEnvs();
  });

  it('emits a receipt with czap + node versions', async () => {
    const { exit, stdout } = await captureCli(() => version({ pretty: false }));
    expect(exit).toBe(0);
    const receipt = JSON.parse(stdout.trim().split('\n').pop()!);
    expect(receipt.command).toBe('version');
    expect(receipt.status).toBe('ok');
    expect(typeof receipt.czap).toBe('string');
    expect(receipt.czap).toMatch(/^\d+\.\d+\.\d+/);
    expect(typeof receipt.node).toBe('string');
    expect(receipt.node).toBe(process.versions.node);
    // pnpm may be null in some environments; just check the shape.
    expect(['string', 'object']).toContain(typeof receipt.pnpm);
  });

  it('pretty mode writes a one-liner to stderr', async () => {
    const { exit, stderr } = await captureCli(() => version({ pretty: true }));
    expect(exit).toBe(0);
    // Format: `czap <semver>  (Node <ver>, pnpm <ver-or-not-found>)\n`
    expect(stderr).toMatch(/^czap \d+\.\d+\.\d+/);
    expect(stderr).toContain('Node ' + process.versions.node);
    expect(stderr).toMatch(/pnpm (\d+\.\d+|not found)/);
  });

  it('receipt has pnpm=null when pnpm cannot be located on PATH', async () => {
    // Covers probePnpmVersion's catch arm (spawnArgvCapture rejects with
    // ENOENT) and the `!r` branch of the `if (!r || r.exitCode !== 0)`
    // guard. vi.stubEnv auto-restores via the file-level afterEach,
    // so this can't leak to peers even if the test itself throws.
    vi.stubEnv('PATH', '/this-path-deliberately-has-no-pnpm-binary');
    const { exit, stdout } = await captureCli(() => version({ pretty: false }));
    expect(exit).toBe(0);
    const receipt = JSON.parse(stdout.trim().split('\n').pop()!);
    expect(receipt.pnpm).toBeNull();
  });
});
