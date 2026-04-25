/**
 * Vitest browser command — spawns `pnpm exec tsx packages/cli/src/bin.ts
 * scene dev <scenePath>` in the Node host, reads stdout until the dev
 * server emits a JSON receipt with `url`, and returns the resolved URL.
 *
 * Lives Node-side because `node:child_process` cannot run in the browser
 * lane. The companion `stopSceneDev` command kills the spawned child.
 *
 * Coverage capture is automatic — `withSpawned` inherits NODE_V8_COVERAGE.
 *
 * @module
 */

import { startSpawnHandle, type SpawnHandle } from '../../../scripts/lib/spawn.js';

interface BrowserCommandContext {
  readonly testPath: string | undefined;
}

const handles = new Map<string, SpawnHandle>();

async function readUrl(handle: SpawnHandle): Promise<string> {
  for await (const line of handle.readline()) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    try {
      const receipt = JSON.parse(trimmed) as { url?: unknown };
      if (typeof receipt.url === 'string') return receipt.url;
    } catch { /* not yet a complete JSON line */ }
  }
  throw new Error('subprocess closed without emitting url');
}

/**
 * Browser command: spawn `scene dev <scenePath>` and return the resolved URL.
 * Stores the live handle keyed by `testPath` so `stopSceneDev` can dispose.
 */
export async function startSceneDev(
  context: BrowserCommandContext,
  scenePath: string,
): Promise<string> {
  const key = context.testPath ?? 'anonymous';
  const handle = startSpawnHandle(
    'pnpm',
    ['exec', 'tsx', 'packages/cli/src/bin.ts', 'scene', 'dev', scenePath],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  handles.set(key, handle);
  try {
    const url = await readUrl(handle);
    return url;
  } catch (err) {
    await handle.dispose();
    handles.delete(key);
    throw err;
  }
}

/** Browser command: dispose the dev server spawned by `startSceneDev`. */
export async function stopSceneDev(context: BrowserCommandContext): Promise<void> {
  const key = context.testPath ?? 'anonymous';
  const handle = handles.get(key);
  if (!handle) return;
  handles.delete(key);
  await handle.dispose();
}
