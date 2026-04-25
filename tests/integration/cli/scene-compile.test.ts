import { describe, it, expect } from 'vitest';
import { run } from '@czap/cli';

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

describe('czap scene compile', () => {
  it('emits a receipt with sceneId + trackCount for the intro example', async () => {
    const { exit, stdout } = await capture(() => run(['scene', 'compile', 'examples/scenes/intro.ts']));
    expect(exit).toBe(0);
    const receipt = JSON.parse(stdout.trim().split('\n').pop()!);
    expect(receipt.status).toBe('ok');
    expect(receipt.sceneId).toMatch(/^fnv1a:/);
    expect(receipt.trackCount).toBe(6);
  });

  it('returns exit code 1 for a missing scene file', async () => {
    const { exit } = await capture(() => run(['scene', 'compile', 'no-such.ts']));
    expect(exit).toBe(1);
  });
});
