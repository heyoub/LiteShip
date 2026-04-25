/**
 * Unit tests for `asset analyze`. Exercises the missing-manifest, unknown-asset,
 * and asset-not-on-disk error branches that the integration test doesn't hit.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { assetAnalyze } from '../../../../packages/cli/src/commands/asset-analyze.js';

async function captureCli<T>(fn: () => Promise<T>): Promise<{ exit: T; stdout: string; stderr: string }> {
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
    const exit = await fn();
    return { exit, stdout, stderr };
  } finally {
    (process.stdout as unknown as { write: typeof origO }).write = origO;
    (process.stderr as unknown as { write: typeof origE }).write = origE;
  }
}

const MANIFEST_PATH = 'reports/capsule-manifest.json';
let savedManifest: string | undefined;

describe('asset analyze (unit)', () => {
  beforeAll(() => {
    if (existsSync(MANIFEST_PATH)) {
      savedManifest = readFileSync(MANIFEST_PATH, 'utf8');
    }
  });
  beforeEach(() => {
    mkdirSync(dirname(MANIFEST_PATH), { recursive: true });
    // Drop intermediate idempotency cache so tests are deterministic.
    if (existsSync('.czap/cache')) rmSync('.czap/cache', { recursive: true, force: true });
  });
  afterAll(() => {
    if (savedManifest !== undefined) writeFileSync(MANIFEST_PATH, savedManifest, 'utf8');
    else if (existsSync(MANIFEST_PATH)) rmSync(MANIFEST_PATH);
  });

  it('exits 1 with stderr when the manifest is missing', async () => {
    if (existsSync(MANIFEST_PATH)) rmSync(MANIFEST_PATH);
    const r = await captureCli(() => assetAnalyze('intro-bed', 'beat'));
    expect(r.exit).toBe(1);
    expect(r.stderr).toMatch(/manifest missing/);
  });

  it('exits 1 when the asset id is not in the manifest', async () => {
    writeFileSync(
      MANIFEST_PATH,
      JSON.stringify({ generatedAt: new Date().toISOString(), capsules: [] }),
      'utf8',
    );
    const r = await captureCli(() => assetAnalyze('not-an-asset', 'beat'));
    expect(r.exit).toBe(1);
    expect(r.stderr).toMatch(/not registered/);
  });

  it('exits 1 when the asset source file is not on disk', async () => {
    writeFileSync(
      MANIFEST_PATH,
      JSON.stringify({
        generatedAt: new Date().toISOString(),
        capsules: [
          { name: 'phantom-asset', kind: 'cachedProjection', source: 'examples/scenes/phantom.wav', generated: { testFile: 't', benchFile: 'b' } },
        ],
      }),
      'utf8',
    );
    const r = await captureCli(() => assetAnalyze('phantom-asset', 'beat'));
    expect(r.exit).toBe(1);
    expect(r.stderr).toMatch(/source file not found/);
  });
});
