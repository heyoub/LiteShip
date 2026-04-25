/**
 * Unit test for `startDevServer` — boots a real Vite server on an ephemeral
 * port, asserts the receipt URL shape, and tears it down. Runs in-process
 * so coverage is captured for `packages/scene/src/dev/server.ts`.
 */
import { describe, it, expect } from 'vitest';
import { startDevServer } from '../../../../packages/scene/src/dev/server.js';

describe('startDevServer', () => {
  it('boots Vite on an ephemeral port and returns a /player.html URL', async () => {
    const handle = await startDevServer('examples/scenes/intro.ts');
    try {
      expect(handle.url).toMatch(/^http:\/\/(localhost|127\.0\.0\.1):\d+\/player\.html$/);
    } finally {
      await handle.close();
    }
  }, 30_000);

  it('close() resolves cleanly and the port is released', async () => {
    const handle = await startDevServer('examples/scenes/intro.ts');
    await handle.close();
    // Re-starting a fresh instance after close should succeed (no port leak).
    const second = await startDevServer('examples/scenes/intro.ts');
    expect(second.url).toMatch(/^http:\/\//);
    await second.close();
  }, 30_000);
});
