/**
 * asset analyze — loads an asset from the registered registry, runs the
 * selected cachedProjection (beat | onset | waveform) on the decoded
 * audio, emits a receipt with markerCount.
 *
 * @module
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { audioDecoder, detectBeats, detectOnsets, computeWaveform } from '@czap/assets';
import { emit, emitError, getCapsuleManifestPath } from '../receipts.js';
import { tryReadCache, writeCache } from '../idempotency.js';
import type { IdempotencyCtx } from '../idempotency.js';

interface ManifestEntry {
  readonly name: string;
  readonly source?: string;
  readonly kind?: string;
}

interface Manifest {
  readonly capsules: readonly ManifestEntry[];
}

type Projection = 'beat' | 'onset' | 'waveform';

/** Execute the asset analyze command. */
export async function assetAnalyze(assetId: string, projection: Projection, force = false): Promise<number> {
  const manifestPath = getCapsuleManifestPath();
  if (!existsSync(manifestPath)) {
    emitError('asset.analyze', 'capsule manifest missing — run capsule:compile first');
    return 1;
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest;
  const entry = manifest.capsules.find((c) => c.name === assetId);
  if (!entry) {
    emitError('asset.analyze', `asset not registered in manifest: ${assetId}`);
    return 1;
  }

  const ctx: IdempotencyCtx = {
    command: 'asset.analyze',
    inputs: { assetId, projection },
    force,
  };
  const cached = tryReadCache(ctx);
  if (cached) {
    emit({ ...(cached as Record<string, unknown>), cached: true });
    return 0;
  }

  // Assets typically live under examples/scenes/<id>.wav; try a few conventions.
  const candidates = [resolve('examples/scenes', `${assetId}.wav`), entry.source ? resolve(entry.source) : ''].filter(
    (p) => p && existsSync(p),
  );

  if (candidates.length === 0) {
    emitError('asset.analyze', `asset source file not found for: ${assetId}`);
    return 1;
  }

  const bytes = readFileSync(candidates[0]!).buffer as ArrayBuffer;
  const decoded = await audioDecoder(bytes);

  let markerCount = 0;
  if (projection === 'beat') markerCount = detectBeats(decoded).beats.length;
  else if (projection === 'onset') markerCount = detectOnsets(decoded).length;
  else markerCount = computeWaveform(decoded, { bins: 512 }).length;

  const receipt = {
    status: 'ok',
    command: 'asset.analyze',
    timestamp: new Date().toISOString(),
    assetId,
    projection,
    markerCount,
  };
  writeCache(ctx, receipt);
  emit({ ...receipt, cached: false });
  return 0;
}
