/**
 * Unit tests for `czap version`. Emits a JSON receipt with czap, Node,
 * and (best-effort) pnpm versions.
 */
import { describe, it, expect } from 'vitest';
import { version } from '../../../../packages/cli/src/commands/version.js';
import { captureCli } from '../../../integration/cli/capture.js';

describe('version command', () => {
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
});
