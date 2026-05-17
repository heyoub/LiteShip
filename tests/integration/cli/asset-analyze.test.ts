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
    // stdio array (not the string 'ignore') so spawnArgv can attach its
    // stderr ring buffer — without this, r.stderrTail is always empty and
    // a non-zero exit produces "capsule:compile failed: " with no detail,
    // which is exactly the failure mode that surfaced during a flake.
    const r = await spawnArgv(
      'pnpm',
      ['run', 'capsule:compile'],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
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

  // The three projection arms in asset-analyze.ts:67–69 are
  // `if (projection === 'beat') ... else if (projection === 'onset') ...
  // else (waveform)`. The beat case has its own happy-path test above.
  // These two cover the remaining arms so all three projections run
  // at least once. Also runs each command twice in series — the second
  // call exercises the tryReadCache hit arm at line 48 (`cached: true`
  // receipt). Capsule compile is shared across the file so the cost
  // is paid once.
  it('runs onset projection and emits markerCount; the second call comes from cache', async () => {
    const r = await spawnArgv('pnpm', ['run', 'capsule:compile'], { stdio: ['ignore', 'pipe', 'pipe'] });
    if (r.exitCode !== 0) throw new Error(`capsule:compile failed: ${r.stderrTail}`);

    const first = await captureCli(() => run(['asset', 'analyze', 'intro-bed', '--projection=onset', '--force']));
    expect(first.exit).toBe(0);
    const firstReceipt = JSON.parse(first.stdout.trim().split('\n').pop()!);
    expect(firstReceipt.projection).toBe('onset');
    expect(typeof firstReceipt.markerCount).toBe('number');
    expect(firstReceipt.cached).toBe(false);

    const second = await captureCli(() => run(['asset', 'analyze', 'intro-bed', '--projection=onset']));
    expect(second.exit).toBe(0);
    const secondReceipt = JSON.parse(second.stdout.trim().split('\n').pop()!);
    expect(secondReceipt.cached).toBe(true);
  }, 120_000);

  it('runs waveform projection and emits markerCount (covers the else arm)', async () => {
    const r = await spawnArgv('pnpm', ['run', 'capsule:compile'], { stdio: ['ignore', 'pipe', 'pipe'] });
    if (r.exitCode !== 0) throw new Error(`capsule:compile failed: ${r.stderrTail}`);

    const { exit, stdout } = await captureCli(() =>
      run(['asset', 'analyze', 'intro-bed', '--projection=waveform', '--force']),
    );
    expect(exit).toBe(0);
    const receipt = JSON.parse(stdout.trim().split('\n').pop()!);
    expect(receipt.projection).toBe('waveform');
    expect(typeof receipt.markerCount).toBe('number');
    // waveform computes 512 bins, so markerCount should be > 0.
    expect(receipt.markerCount).toBeGreaterThan(0);
  }, 120_000);
});
