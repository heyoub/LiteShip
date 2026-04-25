/**
 * Unit tests for `asset verify`. Covers manifest-missing, unknown-asset,
 * and the no-generated-test short-circuit.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { assetVerify } from '../../../../packages/cli/src/commands/asset-verify.js';

async function capture<T>(fn: () => Promise<T>): Promise<{ exit: T; stdout: string; stderr: string }> {
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
let saved: string | undefined;

describe('asset verify (unit)', () => {
  beforeAll(() => {
    if (existsSync(MANIFEST_PATH)) saved = readFileSync(MANIFEST_PATH, 'utf8');
  });
  beforeEach(() => {
    mkdirSync(dirname(MANIFEST_PATH), { recursive: true });
  });
  afterAll(() => {
    if (saved !== undefined) writeFileSync(MANIFEST_PATH, saved, 'utf8');
    else if (existsSync(MANIFEST_PATH)) rmSync(MANIFEST_PATH);
  });

  it('exits 1 when manifest is missing', async () => {
    if (existsSync(MANIFEST_PATH)) rmSync(MANIFEST_PATH);
    const r = await capture(() => assetVerify('intro-bed'));
    expect(r.exit).toBe(1);
    expect(r.stderr).toMatch(/manifest missing/);
  });

  it('exits 1 when asset is not registered in the manifest', async () => {
    writeFileSync(
      MANIFEST_PATH,
      JSON.stringify({ generatedAt: new Date().toISOString(), capsules: [] }),
      'utf8',
    );
    const r = await capture(() => assetVerify('not-an-asset'));
    expect(r.exit).toBe(1);
    expect(r.stderr).toMatch(/not registered/);
  });

  it('exits 0 with invariantsChecked=0 when the generated test file does not exist', async () => {
    writeFileSync(
      MANIFEST_PATH,
      JSON.stringify({
        generatedAt: new Date().toISOString(),
        capsules: [
          {
            name: 'no-tests-asset',
            kind: 'cachedProjection',
            source: 'fake.ts',
            generated: { testFile: 'tests/generated/__never_exists__.test.ts', benchFile: 'tests/generated/__never_exists__.bench.ts' },
          },
        ],
      }),
      'utf8',
    );
    const r = await capture(() => assetVerify('no-tests-asset'));
    expect(r.exit).toBe(0);
    const receipt = JSON.parse(r.stdout.trim().split('\n').pop()!);
    expect(receipt.status).toBe('ok');
    expect(receipt.assetId).toBe('no-tests-asset');
    expect(receipt.invariantsChecked).toBe(0);
  });
});
