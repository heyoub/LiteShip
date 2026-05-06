/**
 * scene dev — launches the Vite dev server + browser scene player.
 * Does not exit until SIGINT; emits a single receipt on startup with
 * the resolved URL so agents and humans know where to connect.
 *
 * @module
 */

import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { emit, emitError } from '../receipts.js';

type StartDevServerFn = (scenePath: string) => Promise<{ url: string; close(): Promise<void> }>;

/** Lazy-load `startDevServer` from the scene package source, bypassing dist. */
async function loadStartDevServer(): Promise<StartDevServerFn> {
  // Resolve relative to this file so the import works in both tsx (src) and
  // compiled (dist) contexts. The scene dev server lives two packages away.
  // In tsx: __filename = packages/cli/src/commands/scene-dev.ts
  // In dist: __filename = packages/cli/dist/commands/scene-dev.js
  const here = dirname(fileURLToPath(import.meta.url));
  // Walk up from packages/cli/src/commands → packages/cli/src → packages/cli → packages
  // Then into packages/scene/src/dev/server.ts
  const serverSrcPath = resolve(here, '../../../scene/src/dev/server.ts');
  if (existsSync(serverSrcPath)) {
    // tsx / dev mode: source is present, import it directly as a file URL
    const mod = (await import(/* @vite-ignore */ pathToFileURL(serverSrcPath).href)) as { startDevServer: StartDevServerFn };
    return mod.startDevServer;
  }
  // Compiled mode: import from dist via the dedicated /dev sub-path. The dev
  // server is intentionally NOT on @czap/scene's main entry (it imports
  // node:os/node:crypto/vite-server and would break browser/Worker bundlers).
  const mod = (await import('@czap/scene/dev')) as { startDevServer: StartDevServerFn };
  return mod.startDevServer;
}

/**
 * Boot the dev server, emit the receipt, and return the live handle.
 * Split out from {@link sceneDev} so unit tests can exercise the
 * input-validation + receipt-emission paths without entering the
 * SIGINT-await loop (which can't be cleanly unit-tested on Windows).
 */
export async function sceneDevSetup(scenePath: string): Promise<
  | { kind: 'ok'; handle: { url: string; close(): Promise<void> } }
  | { kind: 'error'; exit: number }
> {
  const abs = resolve(scenePath);
  if (!existsSync(abs)) {
    emitError('scene.dev', `scene not found: ${scenePath}`);
    return { kind: 'error', exit: 1 };
  }
  const startDevServer = await loadStartDevServer();
  const srv = await startDevServer(abs);
  emit({
    status: 'ok',
    command: 'scene.dev',
    timestamp: new Date().toISOString(),
    url: srv.url,
    scenePath: abs,
  });
  return { kind: 'ok', handle: srv };
}

/** Execute the scene dev command. */
export async function sceneDev(scenePath: string): Promise<number> {
  const setup = await sceneDevSetup(scenePath);
  if (setup.kind === 'error') return setup.exit;
  const srv = setup.handle;
  return new Promise<number>((resolvePromise) => {
    process.on('SIGINT', () => {
      srv.close().finally(() => resolvePromise(0));
    });
  });
}
