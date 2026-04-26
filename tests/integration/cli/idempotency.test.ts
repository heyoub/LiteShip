import { describe, it, expect, beforeEach } from 'vitest';
import { run } from '@czap/cli';
import { rmSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { captureCli } from './capture.js';

describe('content-addressed idempotency', () => {
  const out = resolve('tests/integration/cli/.out-idem.mp4');

  beforeEach(() => {
    rmSync('.czap/cache', { recursive: true, force: true });
    if (existsSync(out)) unlinkSync(out);
    mkdirSync(dirname(out), { recursive: true });
  });

  it('second identical render returns the cached receipt without re-running', async () => {
    const first = await captureCli(() =>
      run(['scene', 'render', 'examples/scenes/intro.ts', '-o', out]),
    );
    expect([0, 5]).toContain(first.exit);
    if (first.exit !== 0) return;  // ffmpeg unavailable — skip
    const r1 = JSON.parse(first.stdout.trim().split('\n').pop()!);

    const second = await captureCli(() =>
      run(['scene', 'render', 'examples/scenes/intro.ts', '-o', out]),
    );
    expect(second.exit).toBe(0);
    const r2 = JSON.parse(second.stdout.trim().split('\n').pop()!);
    expect(r2.cached).toBe(true);
    expect(r2.sceneId).toBe(r1.sceneId);
  }, 240_000);

  it('--force bypasses the cache', async () => {
    await captureCli(() =>
      run(['scene', 'render', 'examples/scenes/intro.ts', '-o', out]),
    );
    const second = await captureCli(() =>
      run(['scene', 'render', 'examples/scenes/intro.ts', '-o', out, '--force']),
    );
    if (second.exit === 5) return; // ffmpeg missing, skip
    expect(second.exit).toBe(0);
    const receipt = JSON.parse(second.stdout.trim().split('\n').pop()!);
    expect(receipt.cached).toBeFalsy();
  }, 240_000);
});
