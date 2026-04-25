import { describe, it, expect } from 'vitest';
import { spawnArgv, withSpawned } from '../../scripts/lib/spawn.js';

describe('capsule-verify', () => {
  it('exits 0 when the manifest is fresh and all generated tests pass', async () => {
    const compile = await spawnArgv('pnpm', ['run', 'capsule:compile'], { stdio: 'inherit' });
    if (compile.exitCode !== 0) throw new Error(`capsule:compile failed: ${compile.stderrTail}`);

    const lines: string[] = [];
    await withSpawned(
      'pnpm',
      ['run', 'capsule:verify'],
      async (handle) => {
        for await (const line of handle.readline()) {
          lines.push(line);
        }
      },
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const lastLine = lines.filter((l) => l.trim().length > 0).pop()!;
    const receipt = JSON.parse(lastLine);
    expect(receipt.status).toBe('ok');
  }, 90_000);
});
