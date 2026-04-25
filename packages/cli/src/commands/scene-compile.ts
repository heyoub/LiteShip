/**
 * scene compile — loads a scene module by path, compiles its capsule's
 * ECS world, emits a receipt with the scene content-address + track count.
 *
 * @module
 */

import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { Effect } from 'effect';
import { emit, emitError } from '../receipts.js';
import type { SceneCompileReceipt } from '../receipts.js';

interface SceneModule {
  readonly [key: string]: unknown;
}

interface CapsuleLike {
  readonly _kind: string;
  readonly id: string;
  readonly name: string;
}

interface ContractLike {
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
    Array.isArray((v as { tracks: unknown }).tracks)
  );
}

/** Execute the scene compile command. */
export async function sceneCompile(scenePath: string): Promise<number> {
  const abs = resolve(scenePath);
  if (!existsSync(abs)) {
    emitError('scene.compile', `scene file not found: ${scenePath}`);
    return 1;
  }

  const mod = (await import(pathToFileURL(abs).href)) as SceneModule;

  const cap = Object.values(mod).find(isCapsule);
  const contract = Object.values(mod).find(isContract);
  if (!cap || !contract) {
    emitError('scene.compile', 'no sceneComposition capsule or scene contract exported');
    return 1;
  }

  const compileFn = Object.values(mod).find(
    (v): v is () => unknown => typeof v === 'function',
  );
  const start = Date.now();
  try {
    if (compileFn) {
      const result = compileFn();
      // Compile fns may return either a CompiledScene descriptor (post-bug-#3
      // refactor) or an Effect (legacy). Run both shapes; the receipt only
      // depends on having executed the compile pipeline successfully.
      if (Effect.isEffect(result)) {
        await Effect.runPromise(result as Effect.Effect<unknown, never, never>);
      }
    }
  } catch (err) {
    emitError('scene.compile', String(err));
    return 1;
  }

  const receipt: SceneCompileReceipt = {
    status: 'ok',
    command: 'scene.compile',
    timestamp: new Date().toISOString(),
    sceneId: cap.id,
    trackCount: contract.tracks.length,
    durationMs: Date.now() - start,
  };
  emit(receipt);
  return 0;
}
