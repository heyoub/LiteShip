import { describe, it, expect } from 'vitest';
import { run } from '@czap/cli';
import { existsSync, unlinkSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

function capture<T>(fn: () => Promise<T>): Promise<{ exit: T; stdout: string; stderr: string }> {
  let stdout = '';
  let stderr = '';
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  (process.stdout as unknown as { write: unknown }).write = ((chunk: string | Uint8Array) => {
    stdout += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString();
    return true;
  });
  (process.stderr as unknown as { write: unknown }).write = ((chunk: string | Uint8Array) => {
    stderr += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString();
    return true;
  });
  return Promise.resolve(fn())
    .then((exit) => ({ exit, stdout, stderr }))
    .finally(() => {
      (process.stdout as unknown as { write: typeof origOut }).write = origOut;
      (process.stderr as unknown as { write: typeof origErr }).write = origErr;
    });
}

describe('czap scene render', () => {
  const out = resolve('tests/integration/cli/.out-intro.mp4');

  it('renders the intro example scene to an mp4', async () => {
    if (existsSync(out)) unlinkSync(out);
    mkdirSync(dirname(out), { recursive: true });
    const { exit, stdout, stderr } = await capture(() =>
      run(['scene', 'render', 'examples/scenes/intro.ts', '-o', out]),
    );
    // If ffmpeg is unavailable on the test environment, accept exit 5 (typed subprocess error).
    expect([0, 5]).toContain(exit);
    if (exit === 0) {
      const receipt = JSON.parse(stdout.trim().split('\n').pop()!);
      expect(receipt.status).toBe('ok');
      expect(receipt.output).toBe(out);
      expect(receipt.frameCount).toBeGreaterThan(0);
      expect(existsSync(out)).toBe(true);
    }
    // On exit 5, stderr should carry a structured error.
    if (exit === 5) {
      expect(stderr).toMatch(/ffmpeg/i);
    }
  }, 60000);

  it('returns exit code 1 for a missing scene file', async () => {
    const { exit } = await capture(() =>
      run(['scene', 'render', 'no-such.ts', '-o', '/tmp/x.mp4']),
    );
    expect(exit).toBe(1);
  });

  it('returns exit code 1 when --output is missing', async () => {
    const { exit } = await capture(() =>
      run(['scene', 'render', 'examples/scenes/intro.ts']),
    );
    expect(exit).toBe(1);
  });
});
