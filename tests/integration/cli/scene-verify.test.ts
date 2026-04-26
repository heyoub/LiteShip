import { describe, it, expect } from 'vitest';
import { spawnArgv } from '../../../scripts/lib/spawn.js';
import { run } from '@czap/cli';
import { captureCli } from './capture.js';

describe('czap scene verify', () => {
  it('runs generated tests for the intro scene and emits an ok receipt', async () => {
    const r = await spawnArgv('pnpm', ['run', 'capsule:compile'], { stdio: 'ignore' });
    if (r.exitCode !== 0) throw new Error(`capsule:compile failed: ${r.stderrTail}`);
    const { exit, stdout } = await captureCli(() => run(['scene', 'verify', 'examples/scenes/intro.ts']));
    expect(exit).toBe(0);
    const receipt = JSON.parse(stdout.trim().split('\n').pop()!);
    expect(receipt.status).toBe('ok');
    expect(receipt.generatedTests).toBeGreaterThan(0);
  }, 120_000);
});
