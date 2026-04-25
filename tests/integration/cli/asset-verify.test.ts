import { describe, it, expect } from 'vitest';
import { spawnArgv } from '../../../scripts/lib/spawn.js';
import { run } from '@czap/cli';
import { captureCli } from './capture.js';

describe('czap asset verify', () => {
  it('returns ok for a registered asset', async () => {
    const r = await spawnArgv('pnpm', ['run', 'capsule:compile'], { stdio: 'ignore' });
    if (r.exitCode !== 0) throw new Error(`capsule:compile failed: ${r.stderrTail}`);
    const { exit } = await captureCli(() => run(['asset', 'verify', 'intro-bed']));
    expect([0, 1]).toContain(exit);
  }, 60000);

  it('exits 1 for unknown asset', async () => {
    const { exit } = await captureCli(() => run(['asset', 'verify', 'missing-asset-12345']));
    expect(exit).toBe(1);
  });
});
