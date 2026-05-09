import { describe, it, expect, beforeEach } from 'vitest';
import { run } from '@czap/cli';
import { accessSync, constants, rmSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { delimiter, resolve, dirname, join } from 'node:path';
import { captureCli } from './capture.js';

function commandOnPath(command: string): boolean {
  const extensions = process.platform === 'win32' ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';') : [''];
  const mode = process.platform === 'win32' ? constants.F_OK : constants.X_OK;
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    for (const extension of extensions) {
      try {
        accessSync(join(dir, `${command}${extension.toLowerCase()}`), mode);
        return true;
      } catch {
        // Try the next PATH entry.
      }
      if (extension !== extension.toUpperCase()) {
        try {
          accessSync(join(dir, `${command}${extension.toUpperCase()}`), mode);
          return true;
        } catch {
          // Try the next extension.
        }
      }
    }
  }
  return false;
}

const FFMPEG_AVAILABLE = commandOnPath('ffmpeg');

describe('content-addressed idempotency', () => {
  const out = resolve('tests/integration/cli/.out-idem.mp4');
  const renderIt = FFMPEG_AVAILABLE ? it : it.skip;

  beforeEach(() => {
    rmSync('.czap/cache', { recursive: true, force: true });
    if (existsSync(out)) unlinkSync(out);
    mkdirSync(dirname(out), { recursive: true });
  });

  renderIt(
    'second identical render returns the cached receipt without re-running',
    async () => {
      const first = await captureCli(() => run(['scene', 'render', 'examples/scenes/intro.ts', '-o', out]));
      expect(first.exit).toBe(0);
      const r1 = JSON.parse(first.stdout.trim().split('\n').pop()!);

      const second = await captureCli(() => run(['scene', 'render', 'examples/scenes/intro.ts', '-o', out]));
      expect(second.exit).toBe(0);
      const r2 = JSON.parse(second.stdout.trim().split('\n').pop()!);
      expect(r2.cached).toBe(true);
      expect(r2.sceneId).toBe(r1.sceneId);
    },
    240_000,
  );

  renderIt(
    '--force bypasses the cache',
    async () => {
      await captureCli(() => run(['scene', 'render', 'examples/scenes/intro.ts', '-o', out]));
      const second = await captureCli(() => run(['scene', 'render', 'examples/scenes/intro.ts', '-o', out, '--force']));
      expect(second.exit).toBe(0);
      const receipt = JSON.parse(second.stdout.trim().split('\n').pop()!);
      expect(receipt.cached).toBeFalsy();
    },
    240_000,
  );
});
