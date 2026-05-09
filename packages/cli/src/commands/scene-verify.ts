/**
 * scene verify — locates the generated test file for a scene's
 * sceneComposition capsule in the manifest and runs it via vitest.
 * Exit codes: 0 ok, 1 input error, 2 test failed.
 *
 * @module
 */

import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { emit, emitError, getCapsuleManifestPath } from '../receipts.js';
import { VitestRunner } from '../capsules/vitest-runner.js';

interface ManifestEntry {
  readonly name: string;
  readonly generated: { testFile: string; benchFile: string };
}

interface Manifest {
  readonly capsules: readonly ManifestEntry[];
}

/** Execute the scene verify command. */
export async function sceneVerify(scenePath: string): Promise<number> {
  const abs = resolve(scenePath);
  if (!existsSync(abs)) {
    emitError('scene.verify', `scene not found: ${scenePath}`);
    return 1;
  }

  const mod = (await import(/* @vite-ignore */ pathToFileURL(abs).href)) as Record<string, unknown>;
  const cap = Object.values(mod).find(
    (v): v is { _kind: string; id: string; name: string } =>
      typeof v === 'object' && v !== null && '_kind' in v && (v as { _kind: unknown })._kind === 'sceneComposition',
  );
  if (!cap) {
    emitError('scene.verify', 'no sceneComposition capsule exported');
    return 1;
  }

  const manifestPath = getCapsuleManifestPath();
  if (!existsSync(manifestPath)) {
    emitError('scene.verify', 'capsule manifest missing; run capsule:compile first');
    return 1;
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest;
  const entry = manifest.capsules.find((c) => c.name === cap.name);
  if (!entry) {
    emitError('scene.verify', `capsule ${cap.name} not in manifest`);
    return 1;
  }

  const { exitCode, stderrTail } = await VitestRunner.run({
    testFiles: [entry.generated.testFile, entry.generated.benchFile],
  });
  if (exitCode !== 0) {
    emitError('scene.verify', `generated tests failed${stderrTail ? `: ${stderrTail.trim()}` : ''}`);
    return 2;
  }

  emit({
    status: 'ok',
    command: 'scene.verify',
    timestamp: new Date().toISOString(),
    sceneId: cap.id,
    generatedTests: 2,
  });
  return 0;
}
