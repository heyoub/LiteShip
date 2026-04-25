/**
 * asset verify — runs the generated test for an asset capsule (if present)
 * via vitest. Short-circuits ok when no generated file exists (asset
 * declared but has no invariants to check).
 *
 * @module
 */

import { existsSync, readFileSync } from 'node:fs';
import { emit, emitError } from '../receipts.js';
import { VitestRunner } from '../capsules/vitest-runner.js';

interface ManifestEntry {
  readonly name: string;
  readonly generated: { testFile: string; benchFile: string };
}

interface Manifest { readonly capsules: readonly ManifestEntry[]; }

/** Execute the asset verify command. */
export async function assetVerify(assetId: string): Promise<number> {
  const manifestPath = 'reports/capsule-manifest.json';
  if (!existsSync(manifestPath)) {
    emitError('asset.verify', 'manifest missing; run capsule:compile first');
    return 1;
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest;
  const entry = manifest.capsules.find((c) => c.name === assetId);
  if (!entry) {
    emitError('asset.verify', `asset not registered: ${assetId}`);
    return 1;
  }

  if (!existsSync(entry.generated.testFile)) {
    emit({
      status: 'ok',
      command: 'asset.verify',
      timestamp: new Date().toISOString(),
      assetId,
      invariantsChecked: 0,
    });
    return 0;
  }

  const { exitCode, stderrTail } = await VitestRunner.run({ testFiles: [entry.generated.testFile] });
  if (exitCode !== 0) {
    emitError('asset.verify', `generated tests failed${stderrTail ? `: ${stderrTail.trim()}` : ''}`);
    return 2;
  }

  emit({
    status: 'ok',
    command: 'asset.verify',
    timestamp: new Date().toISOString(),
    assetId,
    invariantsChecked: 1,
  });
  return 0;
}
