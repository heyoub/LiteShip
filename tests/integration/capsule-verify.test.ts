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
    // Don't trust "last line is JSON" — pnpm/vitest can append reporter
    // output past the script's console.log under nested spawn chains.
    // Pick the last line that actually parses as a JSON object.
    const receiptLine = lines
      .map((line) => line.trim())
      .filter((line) => line.startsWith('{') && line.endsWith('}'))
      .pop();
    expect(receiptLine, `no JSON receipt in stdout. lines=${JSON.stringify(lines)}`).toBeDefined();
    const receipt = JSON.parse(receiptLine!);
    expect(receipt.status).toBe('ok');
  }, 90_000);
});
