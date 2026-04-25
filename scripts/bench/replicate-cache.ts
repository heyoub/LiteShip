import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { writeTextFile } from '../audit/shared.js';
import type { ReplicateResult } from './directive-suite.ts';

/**
 * Shared replicate artifact consumed by both `pnpm run bench` and
 * `pnpm run bench:gate`.
 *
 * The gauntlet runs `bench` immediately before `bench:gate`, so the
 * replicates from `bench` can be reused by `bench:gate` without losing the
 * statistical gate semantics (same 5 replicates, same median/exceedance
 * evaluation). The cache key is the source fingerprint plus environment
 * fingerprint -- if either changes, the cache is ignored and a fresh run
 * executes.
 *
 * The format is intentionally narrower than `directive-gate.json`: it only
 * holds the raw replicate data that the gate evaluator needs to derive its
 * aggregate view, so replicate retention stays close to the source of truth.
 *
 * @module
 */

export const DIRECTIVE_BENCH_ARTIFACT_PATH = 'benchmarks/directive-bench.json';

export interface DirectiveBenchArtifact {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly sourceFingerprint: string;
  readonly environmentFingerprint: string;
  readonly replicateCount: number;
  readonly replicates: readonly ReplicateResult[];
}

export function writeDirectiveBenchArtifact(
  root: string,
  artifact: DirectiveBenchArtifact,
): void {
  writeTextFile(resolve(root, DIRECTIVE_BENCH_ARTIFACT_PATH), JSON.stringify(artifact, null, 2));
}

export function readDirectiveBenchArtifact(root: string): DirectiveBenchArtifact | null {
  const filePath = resolve(root, DIRECTIVE_BENCH_ARTIFACT_PATH);
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as DirectiveBenchArtifact;
    if (parsed.schemaVersion !== 1) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export interface ReplicateCacheLookup {
  readonly sourceFingerprint: string;
  readonly environmentFingerprint: string;
  readonly expectedReplicateCount: number;
}

/**
 * Returns cached replicates if the artifact matches the current source and
 * environment fingerprints and satisfies the expected replicate count.
 * Returns `null` for any mismatch, which means callers should re-run fresh.
 */
export function lookupCachedReplicates(
  root: string,
  lookup: ReplicateCacheLookup,
): readonly ReplicateResult[] | null {
  const artifact = readDirectiveBenchArtifact(root);
  if (!artifact) {
    return null;
  }

  if (artifact.sourceFingerprint !== lookup.sourceFingerprint) {
    return null;
  }

  if (artifact.environmentFingerprint !== lookup.environmentFingerprint) {
    return null;
  }

  if (artifact.replicateCount !== lookup.expectedReplicateCount) {
    return null;
  }

  if (artifact.replicates.length !== lookup.expectedReplicateCount) {
    return null;
  }

  return artifact.replicates;
}
