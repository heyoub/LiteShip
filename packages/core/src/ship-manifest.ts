/**
 * ShipCapsule release-input addressing helpers (ADR-0011).
 *
 * Pure functions that turn raw artifact bytes into {@link AddressedDigest}
 * values consumed by `ShipCapsule.make`. Tarball identity goes through a
 * sorted uncompressed-manifest CBOR, never the raw `.tgz` bytes, since gzip
 * timestamps make those non-deterministic across publish runs.
 *
 * @module
 */

import { gunzipSync } from 'node:zlib';
import { Effect } from 'effect';
import type { AddressedDigest } from './brands.js';
import { CanonicalCbor } from './cbor.js';
import { AddressedDigest as AddressedDigestNs } from './addressed-digest.js';

const bytesToHex = (bytes: Uint8Array): string => {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i]!.toString(16).padStart(2, '0');
  }
  return out;
};

const sha256HexRaw = (bytes: Uint8Array): Effect.Effect<string> =>
  Effect.tryPromise({
    try: async () => {
      const buffer = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
      return bytesToHex(new Uint8Array(buffer));
    },
    catch: (error) =>
      new Error(`SHA-256 hash failed: ${error instanceof Error ? error.message : String(error)}`),
  }).pipe(Effect.orDie);

interface TarEntry {
  readonly path: string;
  readonly size: number;
  readonly bytes: Uint8Array;
}

// Decode a NUL-terminated ASCII field from a USTAR header.
const decodeAsciiZ = (header: Uint8Array, offset: number, length: number): string => {
  let end = offset;
  const stop = offset + length;
  while (end < stop && header[end] !== 0) end++;
  let out = '';
  for (let i = offset; i < end; i++) out += String.fromCharCode(header[i]!);
  return out;
};

// USTAR size field is octal in ASCII (NUL- or space-terminated).
const decodeOctal = (header: Uint8Array, offset: number, length: number): number => {
  const text = decodeAsciiZ(header, offset, length).trim();
  if (text === '') return 0;
  return parseInt(text, 8);
};

const parseTar = (bytes: Uint8Array): TarEntry[] => {
  const entries: TarEntry[] = [];
  let offset = 0;
  let pendingLongPath: string | null = null;
  while (offset + 512 <= bytes.length) {
    const header = bytes.subarray(offset, offset + 512);
    let allZero = true;
    for (let i = 0; i < 512; i++) {
      if (header[i] !== 0) { allZero = false; break; }
    }
    if (allZero) break;

    const name = decodeAsciiZ(header, 0, 100);
    const size = decodeOctal(header, 124, 12);
    const typeflag = header[156] === 0 ? '0' : String.fromCharCode(header[156]!);
    const prefix = decodeAsciiZ(header, 345, 155);
    const dataStart = offset + 512;
    const paddedSize = Math.ceil(size / 512) * 512;
    const data = bytes.subarray(dataStart, dataStart + size);

    if (typeflag === 'L') {
      // GNU long-name extension: next entry's name is in this entry's body.
      let end = data.length;
      while (end > 0 && data[end - 1] === 0) end--;
      let s = '';
      for (let i = 0; i < end; i++) s += String.fromCharCode(data[i]!);
      pendingLongPath = s;
    } else if (typeflag === 'x' || typeflag === 'g') {
      // PAX header: scan for `path=...` records.
      let text = '';
      for (let i = 0; i < data.length; i++) text += String.fromCharCode(data[i]!);
      const lines = text.split('\n');
      for (const line of lines) {
        const spaceIx = line.indexOf(' ');
        if (spaceIx < 0) continue;
        const rest = line.slice(spaceIx + 1);
        const eqIx = rest.indexOf('=');
        if (eqIx < 0) continue;
        const key = rest.slice(0, eqIx);
        const val = rest.slice(eqIx + 1);
        if (key === 'path') pendingLongPath = val;
      }
    } else if (typeflag === '0' || typeflag === '\x00' || typeflag === '7') {
      const fullPath = pendingLongPath !== null
        ? pendingLongPath
        : prefix.length > 0 ? `${prefix}/${name}` : name;
      pendingLongPath = null;
      entries.push({ path: fullPath, size, bytes: new Uint8Array(data) });
    } else {
      pendingLongPath = null;
    }

    offset = dataStart + paddedSize;
  }
  return entries;
};

/**
 * Address a tarball by its sorted uncompressed file manifest.
 * Decompresses gzip, parses USTAR entries, builds a `{path, size, sha256}` list
 * sorted lex by `path`, encodes via CanonicalCbor, and hashes those bytes.
 * Raw `.tgz` bytes are non-deterministic across publish runs (gzip mtime); the
 * manifest is.
 */
export const tarballManifestAddress = (tarballBytes: Uint8Array): Effect.Effect<AddressedDigest, Error> =>
  Effect.gen(function* () {
    const unzipped = yield* Effect.try({
      try: () => new Uint8Array(gunzipSync(tarballBytes)),
      catch: (error) =>
        new Error(`Failed to gunzip tarball: ${error instanceof Error ? error.message : String(error)}`),
    });
    const entries = parseTar(unzipped);
    const manifest: { path: string; size: number; sha256: string }[] = [];
    for (const entry of entries) {
      const sha256 = yield* sha256HexRaw(entry.bytes);
      manifest.push({ path: entry.path, size: entry.size, sha256 });
    }
    manifest.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    const canonical = CanonicalCbor.encode(manifest);
    return yield* AddressedDigestNs.of(canonical);
  });

/** Address a pnpm-lock.yaml (or equivalent) by its raw file bytes. YAML is its own normalization. */
export const lockfileAddress = (lockfileBytes: Uint8Array): Effect.Effect<AddressedDigest, Error> =>
  AddressedDigestNs.of(lockfileBytes);

/**
 * Address a workspace's set of package.json files. Hashes each file with
 * sha256, builds a `{relative_path, sha256}` list sorted lex by
 * `relative_path`, and addresses the CBOR of that list.
 */
export const workspaceManifestAddress = (
  input: ReadonlyArray<{ relative_path: string; package_json_bytes: Uint8Array }>,
): Effect.Effect<AddressedDigest, Error> =>
  Effect.gen(function* () {
    const rows: { relative_path: string; sha256: string }[] = [];
    for (const item of input) {
      const sha256 = yield* sha256HexRaw(item.package_json_bytes);
      rows.push({ relative_path: item.relative_path, sha256 });
    }
    rows.sort((a, b) =>
      a.relative_path < b.relative_path ? -1 : a.relative_path > b.relative_path ? 1 : 0,
    );
    const canonical = CanonicalCbor.encode(rows);
    return yield* AddressedDigestNs.of(canonical);
  });

const ISO_TIMESTAMP_RE = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})/g;

/**
 * Strip platform-specific noise from `pnpm publish --dry-run` stdout so two
 * clean publishes produce byte-identical normalized text. Trims per-line
 * trailing whitespace, normalizes line endings, redacts the repo root prefix,
 * and replaces ISO-8601 timestamps with a fixed token.
 */
export const normalizeDryRunOutput = (
  rawStdout: string,
  normalizationContext: { repo_root_absolute_path: string },
): string => {
  const repoRoot = normalizationContext.repo_root_absolute_path;
  const unified = rawStdout.replace(/\r\n/g, '\n');
  const trimmed = unified
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n');
  const repoReplaced = repoRoot.length > 0 ? trimmed.split(repoRoot).join('<REPO>') : trimmed;
  return repoReplaced.replace(ISO_TIMESTAMP_RE, '<TIME>');
};

/** Address a normalized `pnpm publish --dry-run` stdout (see {@link normalizeDryRunOutput}). */
export const normalizedDryRunAddress = (
  rawStdout: string,
  normalizationContext: { repo_root_absolute_path: string },
): Effect.Effect<AddressedDigest, Error> => {
  const normalized = normalizeDryRunOutput(rawStdout, normalizationContext);
  const bytes = new TextEncoder().encode(normalized);
  return AddressedDigestNs.of(bytes);
};
