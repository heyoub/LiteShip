/**
 * Dev-mode Vite server for the scene player. Serves player.html, watches
 * the scene file, emits `czap:scene-update` events via WebSocket when
 * the scene module changes, so the browser player can reload without
 * losing the current playhead.
 *
 * @module
 */

import { createServer, type ViteDevServer } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Handle returned from `startDevServer` — exposes the live URL + a close hook. */
export interface DevServerHandle {
  readonly url: string;
  close(): Promise<void>;
}

/** Start the scene-dev Vite server bound to `scenePath`. */
export async function startDevServer(scenePath: string): Promise<DevServerHandle> {
  const here = dirname(fileURLToPath(import.meta.url));
  const server: ViteDevServer = await createServer({
    root: here,
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
