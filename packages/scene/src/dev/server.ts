/**
 * Dev-mode Vite server for the scene player. Serves player.html, watches
 * the scene file, emits `czap:scene-update` events via WebSocket when
 * the scene module changes, so the browser player can reload without
 * losing the current playhead.
 *
 * @module
 */

import { createServer, type ViteDevServer } from 'vite';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

/** Handle returned from `startDevServer` — exposes the live URL + a close hook. */
export interface DevServerHandle {
  readonly url: string;
  close(): Promise<void>;
}

/** Start the scene-dev Vite server bound to `scenePath`. */
export async function startDevServer(scenePath: string): Promise<DevServerHandle> {
  const here = dirname(fileURLToPath(import.meta.url));
  // Per-instance cacheDir: when multiple dev servers boot concurrently (e.g.
  // vitest forks running scene-dev tests in parallel), the default
  // node_modules/.vite/ cache is shared and the racing dep-scans trip
  // "The server is being restarted or closed. Request is outdated" in
  // rolldown's dep-scan plugin. Isolating each instance to its own cache
  // dir eliminates the race; cost is a one-time scan per process, which is
  // negligible for the player.html entry.
  const cacheDir = join(tmpdir(), `czap-scene-dev-${process.pid}-${randomBytes(4).toString('hex')}`);
  const server: ViteDevServer = await createServer({
    root: here,
    cacheDir,
    server: { port: 0 },
    plugins: [
      {
        name: 'czap-scene-watch',
        configureServer(s) {
          s.watcher.add(resolve(scenePath));
          s.watcher.on('change', (file) => {
            if (file.endsWith(scenePath) || resolve(file) === resolve(scenePath)) {
              s.ws.send({ type: 'custom', event: 'czap:scene-update', data: { sceneId: file } });
            }
          });
        },
      },
    ],
  });
  await server.listen();
  const baseUrl = server.resolvedUrls?.local[0] ?? `http://localhost:${server.config.server.port ?? 0}/`;
  // The Vite dev server with `root: <player.html dir>` does not serve `index.html`,
  // so the receipt must point at `/player.html` so humans and headless agents land
  // on the actual player UI rather than a 404 stub.
  const resolvedUrl = new URL('player.html', baseUrl).toString();
  return {
    url: resolvedUrl,
    close: async (): Promise<void> => {
      await server.close();
    },
  };
}
