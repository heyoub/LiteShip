import { describe, it, expect } from 'vitest';
import { run } from '@czap/cli';
import { spawnSync } from 'node:child_process';
import { existsSync, unlinkSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const FFMPEG_AVAILABLE = (() => {
  try {
    return spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
  } catch {
    return false;
  }
})();

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
