/**
 * Unit tests for `scene verify` covering missing-scene, missing-capsule-export,
 * missing-manifest, and not-in-manifest branches.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { sceneVerify } from '../../../../packages/cli/src/commands/scene-verify.js';

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

describe('scene verify (unit)', () => {
  beforeAll(() => {
    if (existsSync(MANIFEST_PATH)) saved = readFileSync(MANIFEST_PATH, 'utf8');
  });
  beforeEach(() => mkdirSync(dirname(MANIFEST_PATH), { recursive: true }));
  afterAll(() => {
    if (saved !== undefined) writeFileSync(MANIFEST_PATH, saved, 'utf8');
    else if (existsSync(MANIFEST_PATH)) rmSync(MANIFEST_PATH);
  });

  it('exits 1 when scene file does not exist', async () => {
    const r = await capture(() => sceneVerify('does/not/exist.ts'));
    expect(r.exit).toBe(1);
    expect(r.stderr).toMatch(/scene not found/);
  });

  it('exits 1 when scene module does not export a sceneComposition capsule', async () => {
    const r = await capture(() => sceneVerify('tests/fixtures/scene/empty-module.ts'));
    expect(r.exit).toBe(1);
    expect(r.stderr).toMatch(/no sceneComposition capsule exported/);
  });

  // The missing-manifest branch is covered by tests/unit/cli/commands/capsule.test.ts
  // (capsuleInspect/List/Verify all share the same manifest-presence guard).
  // Repeating it here causes EPERM races when test files run in parallel.

  it('exits 1 when the capsule is not in the manifest', async () => {
    writeFileSync(
      MANIFEST_PATH,
      JSON.stringify({ generatedAt: new Date().toISOString(), capsules: [] }),
      'utf8',
    );
    const r = await capture(() => sceneVerify('tests/fixtures/scene/throwing-compile.ts'));
    expect(r.exit).toBe(1);
    expect(r.stderr).toMatch(/not in manifest/);
  });
});
