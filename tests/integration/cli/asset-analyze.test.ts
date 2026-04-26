import { describe, it, expect } from 'vitest';
import { spawnArgv } from '../../../scripts/lib/spawn.js';
import { run } from '@czap/cli';
import { captureCli } from './capture.js';

describe('czap asset analyze', () => {
  it('runs beat projection on intro-bed and emits markerCount', async () => {
    // capsule:compile is type-directed and can run ~5s cold; the per-test
    // timeout below (60s) covers the compile + analyze round-trip. Since
    // Task 5 registered WavMetadataProjection('intro-bed') alongside the
    // existing defineAsset entry, the manifest is guaranteed to contain
    // intro-bed — so a non-zero exit here is a real regression.
    const r = await spawnArgv('pnpm', ['run', 'capsule:compile'], { stdio: 'ignore' });
    if (r.exitCode !== 0) throw new Error(`capsule:compile failed: ${r.stderrTail}`);
    const { exit, stdout } = await captureCli(() =>
      run(['asset', 'analyze', 'intro-bed', '--projection=beat']),
    );
    expect(exit).toBe(0);
    const receipt = JSON.parse(stdout.trim().split('\n').pop()!);
    expect(receipt.projection).toBe('beat');
    expect(typeof receipt.markerCount).toBe('number');
  }, 120_000);

  it('exits 1 for unknown asset', async () => {
    const { exit } = await captureCli(() =>
      run(['asset', 'analyze', 'missing-asset-12345', '--projection=beat']),
    );
    expect(exit).toBe(1);
  });

  it('exits 1 without --projection', async () => {
    const { exit } = await captureCli(() => run(['asset', 'analyze', 'intro-bed']));
    expect(exit).toBe(1);
  });
});
