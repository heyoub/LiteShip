/**
 * ShipCapsule input-addressing helpers (ADR-0011 §Decision item 3).
 *
 *   - `tarballManifestAddress` -- deterministic over the sorted file manifest
 *     even when the surrounding gzip wrapper differs across pack runs.
 *   - `lockfileAddress` -- raw-bytes determinism.
 *   - `workspaceManifestAddress` -- order independence + content sensitivity.
 *   - `normalizeDryRunOutput` / `normalizedDryRunAddress` -- timestamp + CRLF
 *     + repo-root + trailing-ws normalization.
 */

import { describe, it, expect } from 'vitest';
import { spawnArgv } from '../../scripts/lib/spawn.js';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { gunzipSync, gzipSync } from 'node:zlib';
import { Effect } from 'effect';
import {
  tarballManifestAddress,
  lockfileAddress,
  workspaceManifestAddress,
  normalizeDryRunOutput,
  normalizedDryRunAddress,
} from '@czap/core';

const run = <A, E>(eff: Effect.Effect<A, E>) => Effect.runPromise(eff);
const REPO_ROOT = '/home/heyoub/Documents/code/LiteShip';

describe('tarballManifestAddress', () => {
  it('is deterministic across gzip wrappers carrying identical inner-tar content', async () => {
    // Pack `_spine` once, then re-gzip the SAME inner tar bytes with two
    // different gzip mtimes. Raw .tgz bytes differ; manifest address must not.
    const sourceDir = join(REPO_ROOT, 'packages/_spine');
    const workDir = mkdtempSync(join(tmpdir(), 'litesip-tarball-'));
    try {
      cpSync(sourceDir, workDir, { recursive: true });
      await spawnArgv('pnpm', ['pack'], { cwd: workDir });
      const tgzFile = readdirSync(workDir).find((f) => f.endsWith('.tgz'));
      expect(tgzFile).toBeDefined();
      const tgzPath = join(workDir, tgzFile!);
      const tgzBytes = new Uint8Array(readFileSync(tgzPath));
      const innerTar = gunzipSync(tgzBytes);
      const a = new Uint8Array(gzipSync(innerTar, { level: 6 }));
      // Force a different gzip wrapper by changing compression level →
      // different bytes around the same inner tar.
      const b = new Uint8Array(gzipSync(innerTar, { level: 9 }));

      // Sanity: the two .tgz byte sequences MUST differ — otherwise we're not
      // actually testing the manifest-vs-tarball distinction.
      let differ = a.length !== b.length;
      if (!differ) {
        for (let i = 0; i < a.length; i++) {
          if (a[i] !== b[i]) { differ = true; break; }
        }
      }
      expect(differ).toBe(true);

      const addrA = await run(tarballManifestAddress(a));
      const addrB = await run(tarballManifestAddress(b));
      expect(addrA.display_id).toBe(addrB.display_id);
      expect(addrA.integrity_digest).toBe(addrB.integrity_digest);
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });
});

describe('lockfileAddress', () => {
  it('same bytes → identical AddressedDigest', async () => {
    const bytes = new TextEncoder().encode('lockfileVersion: "9.0"\npackages:\n  pnpm@10.32.1: {}\n');
    const a = await run(lockfileAddress(bytes));
    const b = await run(lockfileAddress(new Uint8Array(bytes)));
    expect(a.display_id).toBe(b.display_id);
    expect(a.integrity_digest).toBe(b.integrity_digest);
  });

  it('different bytes → different digests', async () => {
    const a = await run(lockfileAddress(new TextEncoder().encode('lockfileVersion: "9.0"')));
    const b = await run(lockfileAddress(new TextEncoder().encode('lockfileVersion: "9.1"')));
    expect(a.integrity_digest).not.toBe(b.integrity_digest);
  });
});

describe('workspaceManifestAddress', () => {
  const pkgA = new TextEncoder().encode('{"name":"@czap/a","version":"0.1.0"}');
  const pkgB = new TextEncoder().encode('{"name":"@czap/b","version":"0.1.0"}');
  const pkgC = new TextEncoder().encode('{"name":"@czap/c","version":"0.1.0"}');

  it('is order-independent (helper sorts internally)', async () => {
    const inOrder = [
      { relative_path: 'packages/a', package_json_bytes: pkgA },
      { relative_path: 'packages/b', package_json_bytes: pkgB },
      { relative_path: 'packages/c', package_json_bytes: pkgC },
    ];
    const shuffled = [
      { relative_path: 'packages/c', package_json_bytes: pkgC },
      { relative_path: 'packages/a', package_json_bytes: pkgA },
      { relative_path: 'packages/b', package_json_bytes: pkgB },
    ];
    const a = await run(workspaceManifestAddress(inOrder));
    const b = await run(workspaceManifestAddress(shuffled));
    expect(a.display_id).toBe(b.display_id);
    expect(a.integrity_digest).toBe(b.integrity_digest);
  });

  it('one-byte flip in any package_json_bytes changes both digests', async () => {
    const baseInput = [
      { relative_path: 'packages/a', package_json_bytes: pkgA },
      { relative_path: 'packages/b', package_json_bytes: pkgB },
    ];
    const mutatedB = new Uint8Array(pkgB);
    mutatedB[0] = (mutatedB[0]! ^ 0x01) & 0xff;
    const flipped = [
      { relative_path: 'packages/a', package_json_bytes: pkgA },
      { relative_path: 'packages/b', package_json_bytes: mutatedB },
    ];
    const a = await run(workspaceManifestAddress(baseInput));
    const b = await run(workspaceManifestAddress(flipped));
    expect(a.display_id).not.toBe(b.display_id);
    expect(a.integrity_digest).not.toBe(b.integrity_digest);
  });
});

describe('normalizeDryRunOutput', () => {
  it('converts CRLF to LF', () => {
    const out = normalizeDryRunOutput('a\r\nb\r\nc', { repo_root_absolute_path: '' });
    expect(out).toBe('a\nb\nc');
  });

  it('strips trailing whitespace per line', () => {
    const out = normalizeDryRunOutput('a   \nb\t\t\nc', { repo_root_absolute_path: '' });
    expect(out).toBe('a\nb\nc');
  });

  it('replaces absolute repo-root paths with <REPO>', () => {
    const out = normalizeDryRunOutput(
      '/var/repo/file.txt and /var/repo/packages/x',
      { repo_root_absolute_path: '/var/repo' },
    );
    expect(out).toBe('<REPO>/file.txt and <REPO>/packages/x');
  });

  it('replaces fractional Z timestamps with <TIME>', () => {
    const out = normalizeDryRunOutput(
      'published at 2026-05-13T05:11:28.838Z OK',
      { repo_root_absolute_path: '' },
    );
    expect(out).toBe('published at <TIME> OK');
  });

  it('replaces offset timestamps with <TIME>', () => {
    const out = normalizeDryRunOutput(
      'time=2026-05-13T05:11:28+00:00 done',
      { repo_root_absolute_path: '' },
    );
    expect(out).toBe('time=<TIME> done');
  });

  it('two strings differing only by timestamp → identical normalized output', async () => {
    const ctx = { repo_root_absolute_path: '/tmp/repo' };
    const a = `header\n/tmp/repo/file at 2026-05-13T05:11:28.838Z   \nfooter`;
    const b = `header\n/tmp/repo/file at 2026-05-13T05:12:00.001Z   \nfooter`;
    expect(normalizeDryRunOutput(a, ctx)).toBe(normalizeDryRunOutput(b, ctx));
    const ra = await run(normalizedDryRunAddress(a, ctx));
    const rb = await run(normalizedDryRunAddress(b, ctx));
    expect(ra.display_id).toBe(rb.display_id);
    expect(ra.integrity_digest).toBe(rb.integrity_digest);
  });
});
