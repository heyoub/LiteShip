/**
 * Unit tests for the cli idempotency helpers. The integration test at
 * tests/integration/cli/idempotency.test.ts exercises the round-trip
 * end-to-end via `czap scene render`, but it's gated on ffmpeg being
 * on $PATH and skips on bare CI images — leaving tryReadCache's force
 * arm and the file-present arm un-covered in the merged report. These
 * unit tests close that gap with a tmpdir-via-ctx-cwd fixture so they
 * run unconditionally and never mutate process.cwd().
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  cachePath,
  hashInputs,
  tryReadCache,
  writeCache,
  type IdempotencyCtx,
} from '../../../packages/cli/src/idempotency.js';

describe('cli idempotency helpers', () => {
  let workDir: string;

  const baseCtx = (overrides: Partial<IdempotencyCtx> = {}): IdempotencyCtx => ({
    command: 'test:cmd',
    inputs: { a: 1, b: 'two' },
    force: false,
    cwd: workDir,
    ...overrides,
  });

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'czap-idem-'));
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('hashInputs is canonical: key permutation does not change the hash', () => {
    const h1 = hashInputs(baseCtx({ inputs: { a: 1, b: 'two' } }));
    const h2 = hashInputs(baseCtx({ inputs: { b: 'two', a: 1 } }));
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{16}$/);
  });

  it('cachePath joins under <cwd>/.czap/cache/<hash>.json', () => {
    const p = cachePath('deadbeefdeadbeef', workDir);
    expect(p).toBe(join(workDir, '.czap', 'cache', 'deadbeefdeadbeef.json'));
  });

  it('cachePath defaults to process.cwd() when no cwd is given (back-compat)', () => {
    const p = cachePath('deadbeefdeadbeef');
    expect(p).toBe(join(process.cwd(), '.czap', 'cache', 'deadbeefdeadbeef.json'));
  });

  it('tryReadCache returns null when force=true even if a cached receipt exists', () => {
    const ctx = baseCtx();
    writeCache(ctx, { hello: 'world' });
    expect(existsSync(cachePath(hashInputs(ctx), workDir))).toBe(true);
    // Negative control: same ctx without force returns the cached receipt.
    expect(tryReadCache(ctx)).toEqual({ hello: 'world' });
    // The force arm: bypass even though the file is on disk.
    expect(tryReadCache(baseCtx({ force: true }))).toBeNull();
  });

  it('tryReadCache returns the parsed JSON receipt when the cache file is present', () => {
    const ctx = baseCtx();
    writeCache(ctx, { command: 'test:cmd', status: 'ok', value: 42 });
    const cached = tryReadCache(ctx);
    expect(cached).toEqual({ command: 'test:cmd', status: 'ok', value: 42 });
    // Bytes are pretty-printed JSON, not CBOR — sanity check the format on disk.
    const raw = readFileSync(cachePath(hashInputs(ctx), workDir), 'utf8');
    expect(raw).toContain('\n  "command": "test:cmd"');
  });

  it('tryReadCache returns null when no cache file exists for this ctx', () => {
    expect(tryReadCache(baseCtx())).toBeNull();
  });

  it('writeCache creates the .czap/cache directory tree if it is missing', () => {
    expect(existsSync(join(workDir, '.czap'))).toBe(false);
    writeCache(baseCtx(), { ok: true });
    expect(existsSync(join(workDir, '.czap', 'cache'))).toBe(true);
  });

  it('different command names produce different hashes even with identical inputs', () => {
    const h1 = hashInputs(baseCtx({ command: 'one' }));
    const h2 = hashInputs(baseCtx({ command: 'two' }));
    expect(h1).not.toBe(h2);
  });

  it('manually-placed cache file (no writeCache) is still picked up by tryReadCache', () => {
    const ctx = baseCtx({ inputs: { z: 99 } });
    const path = cachePath(hashInputs(ctx), workDir);
    mkdirSync(join(workDir, '.czap', 'cache'), { recursive: true });
    writeFileSync(path, JSON.stringify({ manual: true }), 'utf8');
    expect(tryReadCache(ctx)).toEqual({ manual: true });
  });
});
