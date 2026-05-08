#!/usr/bin/env tsx
/**
 * capsule-verify — reads `reports/capsule-manifest.json`, verifies each
 * capsule's generated files exist and are fresh (source mtime vs test
 * mtime), runs the generated test suite, emits a JSON verdict to stdout.
 *
 * Exit codes: 0 ok, 1 stale/missing, 2 generated tests failed.
 *
 * @module
 */

import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { getCapsuleManifestPath } from '../packages/cli/src/receipts.js';
import { execSync } from 'node:child_process';

interface Verdict {
  readonly status: 'ok' | 'stale' | 'failed';
  readonly errors: readonly string[];
  readonly capsuleCount: number;
}

interface ManifestEntry {
  readonly name: string;
  readonly source: string;
  readonly generated: { testFile: string; benchFile: string };
}

function main(): Verdict {
  const errors: string[] = [];
  const manifestPath = getCapsuleManifestPath();

  if (!existsSync(manifestPath)) {
    return { status: 'stale', errors: ['manifest missing; run capsule:compile first'], capsuleCount: 0 };
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { capsules: ManifestEntry[] };
  for (const cap of manifest.capsules) {
    const testPath = resolve(cap.generated.testFile);
    const benchPath = resolve(cap.generated.benchFile);
    const sourcePath = resolve(cap.source);

    if (!existsSync(testPath)) errors.push(`generated test missing for ${cap.name}: ${cap.generated.testFile}`);
    if (!existsSync(benchPath)) errors.push(`generated bench missing for ${cap.name}: ${cap.generated.benchFile}`);
    if (existsSync(sourcePath) && existsSync(testPath)) {
      const sourceAge = statSync(sourcePath).mtimeMs;
      const testAge = statSync(testPath).mtimeMs;
      if (sourceAge > testAge) errors.push(`stale: ${cap.name} (source newer than generated test)`);
    }
  }

  if (errors.length > 0) {
    return { status: 'stale', errors, capsuleCount: manifest.capsules.length };
  }

  // Only run vitest if there are generated tests present.
  if (manifest.capsules.length > 0) {
    try {
      // Route nested vitest stdout to *our* stderr so this script's stdout
      // stays a single-line JSON receipt. Without this, vitest reporter
      // output interleaves on stdout and the receipt is no longer the last
      // line — which broke the capsule-verify integration test under nested
      // pnpm test → flex:verify spawn chains (last line was vitest summary
      // text, JSON.parse exploded with "Unexpected token '...'").
      execSync('pnpm exec vitest run tests/generated/', {
        stdio: ['ignore', process.stderr, process.stderr],
      });
    } catch {
      return { status: 'failed', errors: ['generated tests failed'], capsuleCount: manifest.capsules.length };
    }
  }

  return { status: 'ok', errors: [], capsuleCount: manifest.capsules.length };
}

const verdict = main();
console.log(JSON.stringify(verdict));
process.exit(verdict.status === 'ok' ? 0 : 1);
