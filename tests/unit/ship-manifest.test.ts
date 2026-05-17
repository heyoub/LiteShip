/**
 * ShipCapsule input-addressing helpers (ADR-0011 §Decision item 3).
 *
 *   - `tarballManifestAddress` -- deterministic over the sorted file manifest
 *     even when the surrounding gzip wrapper differs across pack runs.
 *   - `lockfileAddress` -- raw-bytes determinism.
 *   - `workspaceManifestAddress` -- order independence + content sensitivity.
 *   - `normalizeDryRunOutput` / `normalizedDryRunAddress` -- timestamp + CRLF
 *     + repo-root + trailing-ws normalization.
 *   - `parseTar` (via `tarballManifestAddress`) -- PAX header (typeflag 'x')
 *     and GNU long-name (typeflag 'L') equivalence with plain USTAR entries
 *     carrying the same logical path.
 */

import { describe, it, expect } from 'vitest';
import { spawnArgv } from '../../scripts/lib/spawn.js';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { gunzipSync, gzipSync } from 'node:zlib';
import { Effect } from 'effect';
import {
  tarballManifestAddress,
  lockfileAddress,
  workspaceManifestAddress,
  normalizeDryRunOutput,
  normalizedDryRunAddress,
} from '../../packages/cli/src/ship-manifest.js';

const run = <A, E>(eff: Effect.Effect<A, E>) => Effect.runPromise(eff);
const REPO_ROOT = resolve(import.meta.dirname, '..', '..');

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

// ---------------------------------------------------------------------------
// parseTar PAX-header + GNU long-name edge cases.
//
// `parseTar` is module-private; exercise it via `tarballManifestAddress`,
// whose digest is a function of the parsed `{path,size,sha256}` list. Two
// tars whose entries resolve to the same logical path + bytes must hash to
// the same address; the *encoding* of the path (USTAR name, GNU 'L' block,
// PAX 'x' record, USTAR prefix split) must not leak into the digest.
// ---------------------------------------------------------------------------

/** Pad bytes to a 512-byte boundary by writing trailing zeroes. */
const pad512 = (chunks: readonly Uint8Array[]): Uint8Array => {
  let total = 0;
  for (const c of chunks) total += c.length;
  const padded = Math.ceil(total / 512) * 512;
  const out = new Uint8Array(padded);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
};

/** Write an ASCII string into `header` starting at `offset`, NUL-padded. */
const writeAscii = (header: Uint8Array, offset: number, length: number, text: string): void => {
  for (let i = 0; i < length; i++) {
    header[offset + i] = i < text.length ? text.charCodeAt(i) : 0;
  }
};

/** Write a size field as octal ASCII (11 chars + NUL terminator). `parseTar` ignores the checksum so we skip it. */
const writeOctalSize = (header: Uint8Array, size: number): void => {
  const octal = size.toString(8).padStart(11, '0');
  for (let i = 0; i < 11; i++) header[124 + i] = octal.charCodeAt(i);
  header[135] = 0;
};

/**
 * Build a single USTAR-like tar header block. `typeflag` is the single-char
 * tar typeflag. `prefix` populates the v7-extension prefix field at offset 345.
 */
const makeTarHeader = (
  name: string,
  size: number,
  typeflag: string,
  prefix = '',
): Uint8Array => {
  const header = new Uint8Array(512);
  writeAscii(header, 0, 100, name);
  writeOctalSize(header, size);
  header[156] = typeflag.charCodeAt(0);
  writeAscii(header, 257, 6, 'ustar');
  writeAscii(header, 263, 2, '00');
  if (prefix.length > 0) writeAscii(header, 345, 155, prefix);
  return header;
};

/** Encode a payload (string or bytes) and 512-pad it. */
const tarPayload = (data: string | Uint8Array): { bytes: Uint8Array; size: number } => {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return { bytes: pad512([bytes]), size: bytes.length };
};

/** Assemble a tar archive from a list of [header, paddedData] pairs, append two zero blocks, gzip it. */
const assembleTgz = (blocks: readonly Uint8Array[]): Uint8Array => {
  const endMarker = new Uint8Array(1024); // two 512-byte zero blocks
  return new Uint8Array(gzipSync(pad512([...blocks, endMarker])));
};

/**
 * Build a regular tarball with a single file at `path` containing `contents`.
 * When `path` is short enough (≤ 100 bytes), it fits in the USTAR name field.
 */
const tgzWithPlainEntry = (path: string, contents: string): Uint8Array => {
  const payload = tarPayload(contents);
  const header = makeTarHeader(path, payload.size, '0');
  return assembleTgz([header, payload.bytes]);
};

describe('parseTar GNU long-name (typeflag L)', () => {
  it('a long path encoded via a GNU ./@LongLink block resolves to the same manifest address as a USTAR short-name entry', async () => {
    // Exercises the `typeflag === 'L'` branch (ship-manifest.ts:81-86) and
    // the `pendingLongPath !== null` arm of the regular-file dispatch
    // (ship-manifest.ts:102). The GNU long-name extension writes a synthetic
    // './@LongLink' header with typeflag 'L' whose data block carries the
    // real path; the next header's `name` field is ignored. Result: a tar
    // built with [LongLink → real-with-stand-in-name] must hash identically
    // to a plain USTAR tar whose entry name *is* the long path.
    const longPath = 'some/very/deep/directory/structure/with/a/longer-than-usual-filename.txt';
    const contents = 'hello-from-long-name';
    const payload = tarPayload(contents);

    const longLinkPayload = tarPayload(longPath);
    const longLinkHeader = makeTarHeader('././@LongLink', longLinkPayload.size, 'L');
    const realHeader = makeTarHeader('placeholder', payload.size, '0');

    const tgzWithGnu = assembleTgz([longLinkHeader, longLinkPayload.bytes, realHeader, payload.bytes]);
    const tgzPlain = tgzWithPlainEntry(longPath, contents);
    // Negative control: ensure the override actually fired. A tar that
    // *only* used the stand-in name must NOT match.
    const tgzStandIn = tgzWithPlainEntry('placeholder', contents);

    const addrGnu = await run(tarballManifestAddress(tgzWithGnu));
    const addrPlain = await run(tarballManifestAddress(tgzPlain));
    const addrStandIn = await run(tarballManifestAddress(tgzStandIn));
    expect(addrGnu.display_id).toBe(addrPlain.display_id);
    expect(addrGnu.integrity_digest).toBe(addrPlain.integrity_digest);
    expect(addrGnu.integrity_digest).not.toBe(addrStandIn.integrity_digest);
  });
});

describe('parseTar PAX header (typeflag x)', () => {
  it('PAX `path=` record overrides the next entry\'s USTAR name; mixed non-path keys and malformed records are tolerated', async () => {
    // Exercises the `typeflag === 'x'` branch (ship-manifest.ts:87-100)
    // including the inner record-parsing loop's three early-continue paths:
    //   - empty line / no space (spaceIx < 0, line 93)
    //   - no `=` (eqIx < 0, line 96)
    //   - key !== 'path' (line 99)
    // …and the actual override on the `path` key. Result: a tar with a
    // PAX header preceding a stand-in entry must hash identically to a
    // plain USTAR tar whose entry name *is* the PAX-supplied path.
    const realPath = 'pax/long/path/with/an/over-100-char-segment/and-more-depth/some-file.txt';
    // Lines exercised by the parser's inner loop:
    //   ""                  → no space → continue (line 93)
    //   "no-space-here"     → no space → continue (line 93)
    //   "15 no-equals-here" → has space but no '=' → continue (line 96)
    //   "13 uid=0"          → well-formed but key !== 'path' (line 99)
    //   "NN path=<realPath>" → the actual override (line 99 true-branch)
    const pathLine = ` path=${realPath}`;
    const pathLineLen = pathLine.length + 1; // +1 for the trailing \n
    const pathLenPrefix = (pathLineLen + pathLineLen.toString().length).toString();
    const paxRecord =
      `\n` +
      `no-space-here\n` +
      `15 no-equals-here\n` +
      `13 uid=0\n` +
      `${pathLenPrefix}${pathLine}\n`;
    const paxPayload = tarPayload(paxRecord);
    const paxHeader = makeTarHeader('./PaxHeaders/0', paxPayload.size, 'x');

    const contents = 'pax-payload';
    const payload = tarPayload(contents);
    const realHeader = makeTarHeader('short-stand-in', payload.size, '0');

    const tgzPax = assembleTgz([paxHeader, paxPayload.bytes, realHeader, payload.bytes]);
    const tgzPlain = tgzWithPlainEntry(realPath, contents);
    // Negative control: a tar that *only* used the stand-in name must NOT
    // match — confirming the PAX `path=` override actually fired.
    const tgzStandIn = tgzWithPlainEntry('short-stand-in', contents);

    const addrPax = await run(tarballManifestAddress(tgzPax));
    const addrPlain = await run(tarballManifestAddress(tgzPlain));
    const addrStandIn = await run(tarballManifestAddress(tgzStandIn));
    expect(addrPax.display_id).toBe(addrPlain.display_id);
    expect(addrPax.integrity_digest).toBe(addrPlain.integrity_digest);
    expect(addrPax.integrity_digest).not.toBe(addrStandIn.integrity_digest);
  });
});

describe('parseTar USTAR prefix split', () => {
  it('a path split across `prefix` (offset 345) + `name` (offset 0) joins as `prefix/name`', async () => {
    // Exercises the `prefix.length > 0` arm of the regular-file dispatch
    // (ship-manifest.ts:102) — the legacy USTAR mechanism for paths in
    // the (100, 256) range. Result: a tar whose entry name is split
    // across the two fields must hash identically to a plain USTAR tar
    // whose `name` field carries `prefix/name` in one chunk.
    const prefix = 'deep/nested/prefix-segment';
    const name = 'leaf-file.txt';
    const contents = 'split-path';
    const payload = tarPayload(contents);
    const splitHeader = makeTarHeader(name, payload.size, '0', prefix);
    const tgzSplit = assembleTgz([splitHeader, payload.bytes]);
    const tgzJoined = tgzWithPlainEntry(`${prefix}/${name}`, contents);
    // Negative control: an entry with the name but NO prefix must produce
    // a different address — confirming the `prefix + '/' + name` join fired.
    const tgzNameOnly = tgzWithPlainEntry(name, contents);

    const a = await run(tarballManifestAddress(tgzSplit));
    const b = await run(tarballManifestAddress(tgzJoined));
    const c = await run(tarballManifestAddress(tgzNameOnly));
    expect(a.integrity_digest).toBe(b.integrity_digest);
    expect(a.integrity_digest).not.toBe(c.integrity_digest);
  });
});
