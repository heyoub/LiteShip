/**
 * Unit tests for `scene compile` covering the missing-export path,
 * compile-throws path, and Effect-returning compile path.
 */
import { describe, it, expect } from 'vitest';
import { sceneCompile } from '../../../../packages/cli/src/commands/scene-compile.js';

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

describe('scene compile (unit)', () => {
  it('exits 1 with stderr when scene file does not exist', async () => {
    const r = await capture(() => sceneCompile('does/not/exist.ts'));
    expect(r.exit).toBe(1);
    expect(r.stderr).toMatch(/scene file not found/);
  });

  it('exits 1 when the module exports neither a sceneComposition capsule nor a SceneContract', async () => {
    const r = await capture(() => sceneCompile('tests/fixtures/scene/empty-module.ts'));
    expect(r.exit).toBe(1);
    expect(r.stderr).toMatch(/no sceneComposition capsule or scene contract exported/);
  });

  it('exits 1 when the compile function throws', async () => {
    const r = await capture(() => sceneCompile('tests/fixtures/scene/throwing-compile.ts'));
    expect(r.exit).toBe(1);
    expect(r.stderr).toMatch(/boom from compile fixture/);
  });

  it('exits 0 with a valid receipt when compileFn returns an Effect', async () => {
    const r = await capture(() => sceneCompile('tests/fixtures/scene/effect-compile.ts'));
    expect(r.exit).toBe(0);
    const receipt = JSON.parse(r.stdout.trim().split('\n').pop()!);
    expect(receipt.status).toBe('ok');
    expect(receipt.command).toBe('scene.compile');
    expect(receipt.trackCount).toBe(0);
  });
});
