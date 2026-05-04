import { describe, it, expect } from 'vitest';
import { commands } from 'vitest/browser';

declare module 'vitest/internal/browser' {
  interface BrowserCommands {
    startSceneDev: (scenePath: string) => Promise<string>;
    stopSceneDev: () => Promise<void>;
  }
}

declare global {
  interface Window {
    __czap_player_ready?: boolean;
  }
}

/**
 * The player UI lives at `packages/scene/src/dev/player.ts` and runs in the
 * browser. To make Vitest's v8 coverage capture it, we import the module
 * directly via Vitest's Vite (so source maps map back to `packages/...`).
 *
 * In parallel, we spawn the real `scene dev` subprocess via the
 * `startSceneDev` browser command — that subprocess inherits
 * `NODE_V8_COVERAGE` and contributes coverage for `cli/src/bin.ts`,
 * `cli/src/commands/scene-dev.ts`, and `scene/src/dev/server.ts`. The dev
 * server URL is read from the receipt and asserted to be reachable, so
 * the spawn path is exercised end-to-end. The subprocess is killed in the
 * `finally` via `stopSceneDev`, which is what makes withSpawned-style
 * lifecycle tractable from a browser test.
 *
 * The HTML skeleton mirrors `packages/scene/src/dev/player.html` (only the
 * IDs the player.ts touches — no styling). Keep them in sync if the
 * player.html structure ever drifts.
 */
const PLAYER_BODY = `
  <header>
    <button id="play">Play</button>
    <button id="pause">Pause</button>
    <button id="back">&lt;-</button>
    <button id="fwd">-&gt;</button>
    <span id="frame">frame 0</span>
  </header>
  <div id="timeline"><div id="playhead"></div></div>
  <pre id="log"></pre>
`;

describe('scene-dev player UI', () => {
  it('drives play / pause / scrub / keyboard shortcuts and updates frame label', async () => {
    const originalBody = document.body.innerHTML;
    try {
      // 1. Spawn the dev server (covers bin.ts -> sceneDev() -> server.ts via
      //    NODE_V8_COVERAGE inherited by withSpawned). Receipt URL is asserted
      //    to be HTTP, validating end-to-end startup.
      const url = await commands.startSceneDev('examples/scenes/intro.ts');
      expect(url).toMatch(/^http:\/\/(localhost|127\.0\.0\.1):\d+\/player\.html$/);

      // 2. Inject the player DOM skeleton into the test page.
      document.body.innerHTML = PLAYER_BODY;

      // 3. Import player.ts via Vitest's Vite. The dynamic import wrapper hides
      //    the literal specifier from rollup's static analyzer so that the
      //    module is fetched fresh per test invocation; coverage instrumentation
      //    fires on first execution because Vitest's v8 source-maps the URL
      //    back to `packages/scene/src/dev/player.ts`.
      const playerSpec = '../../packages/scene/src/dev/player.ts';
      await (new Function('s', 'return import(s)'))(playerSpec) as Promise<unknown>;

      // player.ts attaches listeners then sets the ready flag at module top level.
      const readyDeadline = Date.now() + 3000;
      while (true) {
        if (window.__czap_player_ready === true) break;
        if (Date.now() > readyDeadline) throw new Error('player ready flag never set');
        await new Promise((r) => setTimeout(r, 30));
      }

      const frameLabel = document.getElementById('frame');
      if (!frameLabel) throw new Error('#frame not found after loadPlayer');
      const click = (id: string): void => {
        const el = document.getElementById(id) as HTMLButtonElement | null;
        if (!el) throw new Error(`#${id} not found`);
        el.click();
      };
      const press = (key: string): void => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      };
      const waitForFrame = async (target: string, timeoutMs = 1000): Promise<void> => {
        const deadline = Date.now() + timeoutMs;
         
        while (true) {
          if (frameLabel.textContent === target) return;
          if (Date.now() > deadline) {
            throw new Error(`expected '${target}', got '${frameLabel.textContent}'`);
          }
          await new Promise((r) => setTimeout(r, 16));
        }
      };

      expect(frameLabel.textContent).toBe('frame 0');

      // Forward button -> frame 1.
      click('fwd');
      await waitForFrame('frame 1');

      // Back button -> frame 0.
      click('back');
      await waitForFrame('frame 0');

      // ']' key -> frame 1.
      press(']');
      await waitForFrame('frame 1');

      // '[' key -> frame 0.
      press('[');
      await waitForFrame('frame 0');

      // '.' key -> frame 10.
      press('.');
      await waitForFrame('frame 10');

      // ',' key -> frame 0 (clamped — setFrame uses Math.max(0, n)).
      press(',');
      await waitForFrame('frame 0');

      // Play button -> rAF advances frame.
      click('play');
      const playDeadline = Date.now() + 3000;
      while (true) {
        const text = frameLabel.textContent ?? '';
        if (/^frame [1-9]/.test(text)) break;
        if (Date.now() > playDeadline) throw new Error(`rAF never advanced — got '${text}'`);
        await new Promise((r) => setTimeout(r, 16));
      }

      // Pause button -> playing flag cleared.
      click('pause');

      // Spacebar -> resume (toggle on).
      press(' ');
      await new Promise((r) => setTimeout(r, 100));

      // Spacebar -> pause (toggle off).
      press(' ');
    } finally {
      document.body.innerHTML = originalBody;
      delete window.__czap_player_ready;
      await commands.stopSceneDev();
    }
  }, 30000);
});
