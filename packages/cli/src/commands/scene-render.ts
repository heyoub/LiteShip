/**
 * scene render — compiles a scene, walks its VideoRenderer output, pipes
 * raw RGBA through ffmpeg to produce an mp4. Exit codes: 0 ok, 1 input
 * error, 5 ffmpeg/subprocess error.
 *
 * @module
 */

import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { Effect } from 'effect';
import { Compositor, VideoRenderer } from '@czap/core';
import type { Millis } from '@czap/core';
import { renderWithFfmpeg } from '../render-backend/ffmpeg.js';
import { emit, emitError } from '../receipts.js';
import type { SceneRenderReceipt } from '../receipts.js';
import { tryReadCache, writeCache } from '../idempotency.js';
import type { IdempotencyCtx } from '../idempotency.js';

interface CapsuleLike {
  readonly _kind: string;
  readonly id: string;
  readonly name: string;
}

interface ContractLike {
  readonly fps: number;
  readonly duration: number;
  readonly tracks: readonly unknown[];
}

function isCapsule(v: unknown): v is CapsuleLike {
  return (
    typeof v === 'object' &&
    v !== null &&
    '_kind' in v &&
    (v as { _kind: unknown })._kind === 'sceneComposition'
  );
}

function isContract(v: unknown): v is ContractLike {
  return (
    typeof v === 'object' &&
    v !== null &&
    'tracks' in v &&
    'fps' in v &&
    'duration' in v
  );
}

/** Execute the scene render command. */
export async function sceneRender(scenePath: string, output: string, force = false): Promise<number> {
  if (!output) {
    emitError('scene.render', 'missing --output / -o path');
    return 1;
  }
  const abs = resolve(scenePath);
  if (!existsSync(abs)) {
    emitError('scene.render', `scene not found: ${scenePath}`);
    return 1;
  }

  const ctx: IdempotencyCtx = {
    command: 'scene.render',
    inputs: { scenePath: abs, output },
    force,
  };
  const cached = tryReadCache(ctx);
  if (cached) {
    // Validate the cached output is still on disk. If the user deleted the
    // mp4 between runs (test setup, manual cleanup, etc.), the cache is
    // stale — fall through to a real render rather than emit a phantom
    // success receipt for a file that doesn't exist.
    const cachedOutput = (cached as { output?: unknown }).output;
    if (typeof cachedOutput === 'string' && existsSync(cachedOutput)) {
      emit({ ...(cached as Record<string, unknown>), cached: true });
      return 0;
    }
  }

  const mod = (await import(/* @vite-ignore */ pathToFileURL(abs).href)) as Record<string, unknown>;
  const cap = Object.values(mod).find(isCapsule);
  const contract = Object.values(mod).find(isContract);
  if (!cap || !contract) {
    emitError('scene.render', 'no sceneComposition capsule or contract exported');
    return 1;
  }

  const width = 1280;
  const height = 720;

  try {
    const { frameCount, elapsedMs } = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const compositor = yield* Compositor.create();
          const renderer = VideoRenderer.make(
            { fps: contract.fps, width, height, durationMs: contract.duration as Millis },
            compositor,
          );
          return yield* Effect.promise(() =>
            renderWithFfmpeg(renderer.frames(), { output, width, height, fps: contract.fps }),
          );
        }),
      ),
    );

    const receipt: SceneRenderReceipt = {
      status: 'ok',
      command: 'scene.render',
      timestamp: new Date().toISOString(),
      sceneId: cap.id,
      output,
      frameCount,
      elapsedMs,
    };
    writeCache(ctx, receipt);
    emit({ ...receipt, cached: false });
    return 0;
  } catch (err) {
    emitError('scene.render', String(err));
    const exitCode = 5;
    return exitCode;
  }
}
