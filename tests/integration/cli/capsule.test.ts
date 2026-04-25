import { describe, it, expect, beforeAll } from 'vitest';
import { spawnArgv } from '../../../scripts/lib/spawn.js';
import { run } from '@czap/cli';
import { captureCli } from './capture.js';

describe('czap capsule *', () => {
  // capsule:compile spins up a ts.Program for type-directed detection.
  // 90s tolerates cold tsx startup + program creation under shared CI load
  // AND v8-coverage instrumentation overhead during coverage:node:tracked
  // runs (NODE_V8_COVERAGE inheritance roughly doubles tsc-host work).
  beforeAll(async () => {
    const r = await spawnArgv('pnpm', ['run', 'capsule:compile'], { stdio: 'ignore' });
    if (r.exitCode !== 0) throw new Error(`capsule:compile failed: ${r.stderrTail}`);
  }, 90_000);

  it('inspect dumps a capsule manifest entry by name', async () => {
    const { exit, stdout } = await captureCli(() =>
      run(['capsule', 'inspect', 'core.boundary.evaluate']),
    );
    expect(exit).toBe(0);
    const receipt = JSON.parse(stdout.trim().split('\n').pop()!);
    expect(receipt.status).toBe('ok');
    expect(receipt.capsule.name).toBe('core.boundary.evaluate');
  });

  it('list returns all capsules by default', async () => {
    const { exit, stdout } = await captureCli(() => run(['capsule', 'list']));
    expect(exit).toBe(0);
    const receipt = JSON.parse(stdout.trim().split('\n').pop()!);
    expect(Array.isArray(receipt.capsules)).toBe(true);
    expect(receipt.capsules.length).toBeGreaterThan(0);
  });

  it('list --kind filters by assembly kind', async () => {
    const { exit, stdout } = await captureCli(() =>
      run(['capsule', 'list', '--kind=pureTransform']),
    );
    expect(exit).toBe(0);
    const receipt = JSON.parse(stdout.trim().split('\n').pop()!);
    expect(receipt.capsules.every((c: { kind: string }) => c.kind === 'pureTransform')).toBe(true);
  });

  it('verify runs generated tests for a capsule', async () => {
    const { exit } = await captureCli(() =>
      run(['capsule', 'verify', 'core.boundary.evaluate']),
    );
    expect(exit).toBe(0);
  }, 90_000);
});
