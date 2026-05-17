/**
 * Unit tests for the cli idempotency helpers. The integration test at
 * tests/integration/cli/idempotency.test.ts exercises the round-trip
 * end-to-end via `czap scene render`, but it's gated on ffmpeg being
 * on $PATH and skips on bare CI images — leaving tryReadCache's force
 * arm and the file-present arm un-covered in the merged report. These
 * unit tests close that gap with a tmpdir-based fixture so they run
 * unconditionally.
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

const baseCtx = (overrides: Partial<IdempotencyCtx> = {}): IdempotencyCtx => ({
  command: 'test:cmd',
  inputs: { a: 1, b: 'two' },
  force: false,
  ...overrides,
});

describe('cli idempotency helpers', () => {
  let workDir: string;
  let prevCwd: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'czap-idem-'));
    prevCwd = process.cwd();
    process.chdir(workDir);
  });

  afterEach(() => {
    process.chdir(prevCwd);
    rmSync(workDir, { recursive: true, force: true });
  });

  it('hashInputs is canonical: key permutation does not change the hash', () => {
    const h1 = hashInputs(baseCtx({ inputs: { a: 1, b: 'two' } }));
    const h2 = hashInputs(baseCtx({ inputs: { b: 'two', a: 1 } }));
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{16}$/);
  });

  it('cachePath always lives under .czap/cache/<hash>.json (relative to cwd)', () => {
    const p = cachePath('deadbeefdeadbeef');
    expect(p).toBe(join('.czap', 'cache', 'deadbeefdeadbeef.json'));
  });

  it('tryReadCache returns null when force=true even if a cached receipt exists', () => {
    const ctx = baseCtx();
    writeCache(ctx, { hello: 'world' });
    expect(existsSync(cachePath(hashInputs(ctx)))).toBe(true);
    // Negative control: same ctx without force returns the cached receipt.
    expect(tryReadCache(ctx)).toEqual({ hello: 'world' });
    // The force arm: should bypass even though the file is on disk.
    expect(tryReadCache(baseCtx({ force: true }))).toBeNull();
  });

  it('tryReadCache returns the parsed JSON receipt when the cache file is present', () => {
    const ctx = baseCtx();
    // writeCache creates the directory tree.
    writeCache(ctx, { command: 'test:cmd', status: 'ok', value: 42 });
    const cached = tryReadCache(ctx);
    expect(cached).toEqual({ command: 'test:cmd', status: 'ok', value: 42 });
    // Bytes are pretty-printed JSON, not CBOR — sanity check the format on disk.
    const raw = readFileSync(cachePath(hashInputs(ctx)), 'utf8');
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
    const path = cachePath(hashInputs(ctx));
    mkdirSync(join(workDir, '.czap', 'cache'), { recursive: true });
    writeFileSync(join(workDir, path), JSON.stringify({ manual: true }), 'utf8');
    expect(tryReadCache(ctx)).toEqual({ manual: true });
  });
});
