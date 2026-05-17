/**
 * Smoke tests for `czap ship`. Lives alongside the other CLI verb tests
 * (doctor, glossary, help, completion, version) so the canonical test
 * layout matches the CLI verb table. Deep behavioral coverage of ship
 * lives in tests/unit/ship-capsule.test.ts and tests/unit/ship-manifest.test.ts;
 * this file just exercises the clean error path and asserts receipt shape.
 */
import { describe, it, expect } from 'vitest';
import { ship } from '../../../../packages/cli/src/commands/ship.js';
import { captureCli } from '../../../integration/cli/capture.js';

describe('ship command (smoke)', () => {
  it('is importable and returns a numeric exit code', async () => {
    expect(typeof ship).toBe('function');
    const { exit } = await captureCli(() => ship(['--filter', 'no-such-package-xyz']));
    expect(typeof exit).toBe('number');
  });

  it('emits an emitError-shaped event on stderr for an unknown --filter', async () => {
    const { exit, stderr } = await captureCli(() => ship(['--filter', 'no-such-package-xyz']));
    expect(exit).toBe(1);
    const line = stderr.trim().split('\n').pop()!;
    const event = JSON.parse(line) as { status: string; command: string; error: string; timestamp: string };
    expect(event.status).toBe('failed');
    expect(event.command).toBe('ship');
    expect(typeof event.error).toBe('string');
    expect(event.error.length).toBeGreaterThan(0);
    expect(typeof event.timestamp).toBe('string');
  });

  it('emitError event includes the offending filter value in the error message', async () => {
    const { stderr } = await captureCli(() => ship(['--filter', 'no-such-package-xyz']));
    const event = JSON.parse(stderr.trim().split('\n').pop()!) as { error: string };
    expect(event.error).toContain('no-such-package-xyz');
  });
});
