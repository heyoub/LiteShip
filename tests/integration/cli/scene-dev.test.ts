import { describe, it, expect } from 'vitest';
import { withSpawned } from '../../../scripts/lib/spawn.js';
import type { SpawnHandle } from '../../../scripts/lib/spawn.js';

// Under v8 coverage on Windows the spawned tsx -> vite-server pipeline
// occasionally trips a STATUS_ACCESS_VIOLATION (exit 3221226505) — a
// known class of v8-profiling-vs-vite-internals interaction. The
// in-process unit test at tests/unit/scene/dev/server.test.ts exercises
// the same startDevServer() path with full coverage and no subprocess
// crash surface, so this integration test is redundant under coverage
// and gets skipped there to keep the gauntlet stable.
const underCoverage = process.env.NODE_V8_COVERAGE !== undefined;
const conditionalIt = underCoverage ? it.skip : it;

describe('czap scene dev', () => {
  conditionalIt('boots a Vite server and prints a receipt with a local URL', async () => {
    await withSpawned(
      'pnpm',
      ['exec', 'tsx', 'packages/cli/src/bin.ts', 'scene', 'dev', 'examples/scenes/intro.ts'],
      async (handle) => {
        const url = await firstUrl(handle);
        expect(url).toMatch(/^http:\/\/(localhost|127\.0\.0\.1):\d+/);
      },
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
  }, 20000);
});

async function firstUrl(handle: SpawnHandle): Promise<string> {
  const deadline = Date.now() + 15000;
  for await (const line of handle.readline()) {
    if (Date.now() > deadline) throw new Error('timeout waiting for url');
    const t = line.trim();
    if (!t.startsWith('{')) continue;
    try {
      const receipt = JSON.parse(t) as { url?: unknown };
      if (typeof receipt.url === 'string' && receipt.url.startsWith('http')) {
        return receipt.url;
      }
    } catch { /* not json yet */ }
  }
  throw new Error('subprocess closed without emitting url');
}
