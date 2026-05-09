import { describe, it, expect } from 'vitest';
import { run } from '@czap/cli';
import { accessSync, constants, existsSync, unlinkSync, mkdirSync } from 'node:fs';
import { delimiter, resolve, dirname, join } from 'node:path';

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

function capture<T>(fn: () => Promise<T>): Promise<{ exit: T; stdout: string; stderr: string }> {
  let stdout = '';
  let stderr = '';
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  (process.stdout as unknown as { write: unknown }).write = (chunk: string | Uint8Array) => {
    stdout += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString();
    return true;
  };
  (process.stderr as unknown as { write: unknown }).write = (chunk: string | Uint8Array) => {
    stderr += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString();
    return true;
  };
  return Promise.resolve(fn())
    .then((exit) => ({ exit, stdout, stderr }))
    .finally(() => {
      (process.stdout as unknown as { write: typeof origOut }).write = origOut;
      (process.stderr as unknown as { write: typeof origErr }).write = origErr;
    });
}

describe('czap scene render', () => {
  const out = resolve('tests/integration/cli/.out-intro.mp4');

  const renderIt = FFMPEG_AVAILABLE ? it : it.skip;

  renderIt(
    'renders the intro example scene to an mp4',
    async () => {
      if (existsSync(out)) unlinkSync(out);
      mkdirSync(dirname(out), { recursive: true });
      const { exit, stdout, stderr } = await capture(() =>
        run(['scene', 'render', 'examples/scenes/intro.ts', '-o', out]),
      );
      expect(stderr).toBe('');
      expect(exit).toBe(0);
      const receipt = JSON.parse(stdout.trim().split('\n').pop()!);
      expect(receipt.status).toBe('ok');
      expect(receipt.output).toBe(out);
      expect(receipt.frameCount).toBeGreaterThan(0);
      expect(existsSync(out)).toBe(true);
    },
    240_000,
  );

  it('returns exit code 1 for a missing scene file', async () => {
    const { exit } = await capture(() => run(['scene', 'render', 'no-such.ts', '-o', '/tmp/x.mp4']));
    expect(exit).toBe(1);
  });

  it('returns exit code 1 when --output is missing', async () => {
    const { exit } = await capture(() => run(['scene', 'render', 'examples/scenes/intro.ts']));
    expect(exit).toBe(1);
  });
});
