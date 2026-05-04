/**
 * Unit tests for the `scene dev` command's setup phase. The full SIGINT
 * await loop in `sceneDev` cannot be unit-tested on Windows; instead we
 * exercise the extracted `sceneDevSetup` which performs every step
 * except the long-running wait.
 */
import { describe, it, expect } from 'vitest';
import { sceneDev, sceneDevSetup } from '../../../../packages/cli/src/commands/scene-dev.js';

async function captureStdout<T>(fn: () => Promise<T>): Promise<{ result: T; stdout: string; stderr: string }> {
  let stdout = '';
  let stderr = '';
  const origO = process.stdout.write.bind(process.stdout);
  const origE = process.stderr.write.bind(process.stderr);
  (process.stdout as unknown as { write: unknown }).write = ((c: string | Uint8Array) => {
    stdout += typeof c === 'string' ? c : Buffer.from(c).toString();
    return true;
  });
  (process.stderr as unknown as { write: unknown }).write = ((c: string | Uint8Array) => {
    stderr += typeof c === 'string' ? c : Buffer.from(c).toString();
    return true;
  });
  try {
    const result = await fn();
    return { result, stdout, stderr };
  } finally {
    (process.stdout as unknown as { write: typeof origO }).write = origO;
    (process.stderr as unknown as { write: typeof origE }).write = origE;
  }
}

describe('sceneDevSetup', () => {
  it('returns error 1 with a structured stderr event for a missing scene file', async () => {
    const { result, stderr } = await captureStdout(() =>
      sceneDevSetup('does/not/exist.ts'),
    );
    expect(result.kind).toBe('error');
    if (result.kind === 'error') expect(result.exit).toBe(1);
    expect(stderr).toMatch(/scene not found/);
  });

  it('boots a real Vite server for an existing scene path and emits the receipt', async () => {
    const { result, stdout } = await captureStdout(() =>
      sceneDevSetup('examples/scenes/intro.ts'),
    );
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    try {
      // The receipt is written to stdout as one JSON line.
      const receipt = JSON.parse(stdout.trim().split('\n').pop()!);
      expect(receipt.status).toBe('ok');
      expect(receipt.command).toBe('scene.dev');
      expect(typeof receipt.url).toBe('string');
      expect(receipt.url).toMatch(/^http:\/\//);
    } finally {
      await result.handle.close();
    }
  }, 30_000);

  it('sceneDev: full SIGINT-await loop resolves with 0 when a SIGINT is delivered', async () => {
    // Capture stdout (the receipt) then trigger SIGINT after the server boots
    // so the SIGINT handler closes the server and resolves the promise.
    const captureRun = (async () => {
      let stdout = '';
      const orig = process.stdout.write.bind(process.stdout);
      (process.stdout as unknown as { write: unknown }).write = ((c: string | Uint8Array) => {
        stdout += typeof c === 'string' ? c : Buffer.from(c).toString();
        return true;
      });
      try {
        const exit = await sceneDev('examples/scenes/intro.ts');
        return { exit, stdout };
      } finally {
        (process.stdout as unknown as { write: typeof orig }).write = orig;
      }
    })();

    // Wait one tick for the server to boot and the SIGINT listener to install,
    // then deliver the signal. process.emit('SIGINT') triggers any registered
    // handlers without actually killing the process.
    await new Promise((r) => setTimeout(r, 1500));
    process.emit('SIGINT');

    const { exit } = await captureRun;
    expect(exit).toBe(0);
  }, 30_000);

  it('sceneDev returns the missing-scene exit code without entering the SIGINT loop', async () => {
    // captureStdout to keep emitError's stderr write off the gauntlet log —
    // without this the structured `scene not found` error event leaks past
    // vitest's reporter and reads like an actual gauntlet failure to humans.
    const { result, stderr } = await captureStdout(() => sceneDev('does/not/exist.ts'));
    expect(result).toBe(1);
    expect(stderr).toMatch(/scene not found/);
  });
});
