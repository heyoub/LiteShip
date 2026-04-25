/**
 * Spec 1.1 E2E smoke — proves the chain holds end-to-end:
 *
 *   examples/scenes/intro.ts
 *     -> CLI dispatch (`scene render`)
 *     -> dynamic import + sceneComposition capsule discovery
 *     -> Compositor + VideoRenderer.frames() async iterable
 *     -> renderWithFfmpeg pipe
 *     -> ffmpeg libx264 -> mp4 on disk
 *
 * Pre-Spec-1.1 this would have failed at:
 *   - Task 5 (audioDecoder hardcoded getUint32(40) on textbook WAV)
 *   - Task 6 (SceneRuntime never registered systems; world DOA)
 *
 * Why we drive the CLI in-process via `run([...])` rather than
 * `execSync('pnpm tsx ...')`:
 *   - In-process hits the same dispatch entry the bin.ts wrapper uses.
 *   - In-process honors vitest's @czap/* aliases so `examples/scenes/intro.ts`
 *     can resolve `@czap/scene` from a sibling-of-packages location.
 *   - The compile/render/ffmpeg chain is unchanged either way.
 *
 * Skipped automatically if ffmpeg isn't on PATH so CI without
 * ffmpeg doesn't false-fail.
 *
 * @module
 */

import { describe, it, expect } from 'vitest';
import { execSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  rmSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { run } from '@czap/cli';

const FFMPEG_AVAILABLE = (() => {
  try {
    const r = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return r.status === 0;
  } catch {
    return false;
  }
})();

const FFPROBE_AVAILABLE = (() => {
  try {
    const r = spawnSync('ffprobe', ['-version'], { stdio: 'ignore' });
    return r.status === 0;
  } catch {
    return false;
  }
})();

/** Suppress stdout/stderr writes from the CLI dispatch so vitest output stays clean. */
async function quiet<T>(fn: () => Promise<T>): Promise<T> {
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  (process.stdout as unknown as { write: unknown }).write = () => true;
  (process.stderr as unknown as { write: unknown }).write = () => true;
  try {
    return await fn();
  } finally {
    (process.stdout as unknown as { write: typeof origOut }).write = origOut;
    (process.stderr as unknown as { write: typeof origErr }).write = origErr;
  }
}

describe('Spec 1.1 E2E smoke — intro scene render', () => {
  if (!FFMPEG_AVAILABLE) {
    it.skip('skipped — ffmpeg not on PATH', () => {});
    return;
  }

  it('renders examples/scenes/intro.ts to a non-empty mp4 via ffmpeg', async () => {
    const out = resolve('tests/smoke/.out-intro-smoke.mp4');
    if (existsSync(out)) unlinkSync(out);
    if (!existsSync(dirname(out))) mkdirSync(dirname(out), { recursive: true });

    // --force bypasses the idempotency cache so a stale cache entry from a
    // previous invocation can't masquerade as a successful render.
    const exit = await quiet(() =>
      run(['scene', 'render', 'examples/scenes/intro.ts', '-o', out, '--force']),
    );
    expect(exit).toBe(0);

    expect(existsSync(out)).toBe(true);
    const sz = statSync(out).size;
    // libx264 yuv420p mp4 of a 240-frame 1280x720 clip is at minimum a few KiB
    // (even all-black). 1 KiB floor is the load-bearing "non-empty" check.
    expect(sz).toBeGreaterThan(1024);

    if (FFPROBE_AVAILABLE) {
      const probe = execSync(
        `ffprobe -v error -show_entries format=duration,size -of json "${out}"`,
        { stdio: ['ignore', 'pipe', 'pipe'] },
      ).toString();
      const meta = JSON.parse(probe) as {
        format?: { duration?: string; size?: string };
      };
      const duration = parseFloat(meta.format?.duration ?? '0');
      // intro contract is 4 seconds; allow generous slack for container rounding.
      expect(duration).toBeGreaterThan(0);
      expect(duration).toBeLessThan(10);
    }

    // Cleanup output file but leave dir for next run.
    try {
      rmSync(out, { force: true });
    } catch {
      // Ignore — Windows file locks occasionally prevent immediate unlink.
    }
  }, 120_000);
});
