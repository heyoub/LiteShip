/**
 * End-to-end verdicts for `czap verify` (ADR-0011 §Decision item 5).
 *
 *   - Verified (exit 0): tarball + matching capsule.
 *   - Mismatch (exit 2): capsule whose tarball_manifest_address differs from
 *     the actual tarball's manifest.
 *   - Incomplete (exit 3): capsule fails canonical-CBOR decode (non-canonical
 *     or malformed).
 *   - Unknown  (exit 4): no capsule path provided.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnArgv } from '../../scripts/lib/spawn.js';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { gunzipSync, gzipSync } from 'node:zlib';
import { Effect } from 'effect';
import {
  ContentAddress,
  IntegrityDigest,
  ShipCapsule,
  type AddressedDigest,
  type HLCBrand as HLC,
} from '@czap/core';
import { tarballManifestAddress } from '../../packages/cli/src/ship-manifest.js';
import { verify } from '../../packages/cli/src/commands/ship-verify.js';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');
const run = <A, E>(eff: Effect.Effect<A, E>) => Effect.runPromise(eff);

interface CapturedReceipt {
  readonly verdict: 'Verified' | 'Mismatch' | 'Incomplete' | 'Unknown';
  readonly status: 'ok' | 'failed';
  readonly mismatches: readonly string[];
  readonly checks: { tarball_manifest: string };
}

async function captureVerify(args: readonly string[]): Promise<{ exit: number; receipt: CapturedReceipt | null; stdout: string; stderr: string }> {
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
    const exit = await verify(args);
    let receipt: CapturedReceipt | null = null;
    const lines = stdout.split('\n').filter((l) => l.trim().length > 0);
    if (lines.length > 0) {
      try {
        receipt = JSON.parse(lines[lines.length - 1]!) as CapturedReceipt;
      } catch {
        /* leave receipt null */
      }
    }
    return { exit, receipt, stdout, stderr };
  } finally {
    (process.stdout as unknown as { write: typeof origO }).write = origO;
    (process.stderr as unknown as { write: typeof origE }).write = origE;
  }
}

let workDir: string;
let tarballPath: string;
let tarballBytes: Uint8Array;

beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), 'litesip-verify-'));
  cpSync(join(REPO_ROOT, 'packages/_spine'), workDir, { recursive: true });
  await spawnArgv('pnpm', ['pack'], { cwd: workDir });
  const tgz = readdirSync(workDir).find((f) => f.endsWith('.tgz'));
  if (!tgz) throw new Error('pnpm pack produced no .tgz');
  tarballPath = join(workDir, tgz);
  tarballBytes = new Uint8Array(readFileSync(tarballPath));
});

afterAll(() => {
  if (workDir && existsSync(workDir)) {
    rmSync(workDir, { recursive: true, force: true });
  }
});

const buildCapsuleInput = (tarballManifest: AddressedDigest, wallMs = 1_715_500_000_000): ShipCapsule.Input => ({
  _kind: 'shipCapsule',
  schema_version: 1,
  package_name: '@czap/_spine',
  package_version: '0.1.0',
  source_commit: '0123456789abcdef0123456789abcdef01234567',
  source_dirty: false,
  lockfile_address: { display_id: ContentAddress('fnv1a:aaaaaaaa'), integrity_digest: IntegrityDigest('sha256:' + 'a'.repeat(64)), algo: 'sha256' },
  workspace_manifest_address: { display_id: ContentAddress('fnv1a:bbbbbbbb'), integrity_digest: IntegrityDigest('sha256:' + 'b'.repeat(64)), algo: 'sha256' },
  tarball_manifest_address: tarballManifest,
  build_env: {
    node_version: 'v24.13.1',
    pnpm_version: '10.32.1',
    os: 'linux',
    arch: 'x64',
  },
  package_manager: 'pnpm',
  package_manager_version: '10.32.1',
  publish_dry_run_address: { display_id: ContentAddress('fnv1a:dddddddd'), integrity_digest: IntegrityDigest('sha256:' + 'd'.repeat(64)), algo: 'sha256' },
  lifecycle_scripts_observed: [],
  generated_at: { wall_ms: wallMs, counter: 0, node_id: 'test-node' } as HLC,
  previous_ship_capsule: null,
});

describe('czap verify verdicts', () => {
  it('Verified (exit 0) when tarball matches capsule.tarball_manifest_address', async () => {
    const tmAddr = await run(tarballManifestAddress(tarballBytes));
    const capsule = await run(ShipCapsule.make(buildCapsuleInput(tmAddr)));
    const capsuleBytes = ShipCapsule.canonicalize(capsule);
    const capsulePath = join(workDir, 'verified.shipcapsule.cbor');
    writeFileSync(capsulePath, capsuleBytes);

    const { exit, receipt } = await captureVerify([tarballPath, '--capsule', capsulePath]);
    expect(exit).toBe(0);
    expect(receipt).not.toBeNull();
    expect(receipt!.verdict).toBe('Verified');
    expect(receipt!.status).toBe('ok');
    expect(receipt!.checks.tarball_manifest).toBe('match');
    expect(receipt!.mismatches).toEqual([]);
  });

  it('Mismatch (exit 2) when capsule.tarball_manifest_address disagrees with the tarball', async () => {
    // Use a capsule that addresses a re-gzipped variant of the same inner tar.
    // The inner tar (and thus manifest) is identical, so this still matches —
    // we want true mismatch, so we'll modify the inner tar before re-gzipping.
    const innerTar = gunzipSync(tarballBytes);
    const tamperedInner = new Uint8Array(innerTar);
    // Flip a byte deep enough to be a file-body byte (after the 512-byte
    // header) — any real content alteration changes the manifest sha256.
    if (tamperedInner.length > 1024) tamperedInner[1024] = (tamperedInner[1024]! ^ 0xff) & 0xff;
    const tamperedTgz = new Uint8Array(gzipSync(tamperedInner));
    const tamperedAddr = await run(tarballManifestAddress(tamperedTgz));

    // Build a capsule that claims the tampered (different) manifest address.
    const capsule = await run(ShipCapsule.make(buildCapsuleInput(tamperedAddr)));
    const capsuleBytes = ShipCapsule.canonicalize(capsule);
    const capsulePath = join(workDir, 'mismatch.shipcapsule.cbor');
    writeFileSync(capsulePath, capsuleBytes);

    const { exit, receipt } = await captureVerify([tarballPath, '--capsule', capsulePath]);
    expect(exit).toBe(2);
    expect(receipt).not.toBeNull();
    expect(receipt!.verdict).toBe('Mismatch');
    expect(receipt!.status).toBe('failed');
    expect(receipt!.checks.tarball_manifest).toBe('mismatch');
    expect(receipt!.mismatches.length).toBeGreaterThan(0);
  });

  it('Incomplete (exit 3) when capsule is non-canonical CBOR', async () => {
    const tmAddr = await run(tarballManifestAddress(tarballBytes));
    const capsule = await run(ShipCapsule.make(buildCapsuleInput(tmAddr, 1_715_500_000_002)));
    const canonical = ShipCapsule.canonicalize(capsule);
    // Same longer-form schema_version trick as the ship-capsule.test.ts file.
    const keyBytes = new TextEncoder().encode('schema_version');
    let headIdx = -1;
    for (let i = 0; i + keyBytes.length + 2 < canonical.length; i++) {
      if (canonical[i] !== 0x6e) continue;
      let match = true;
      for (let j = 0; j < keyBytes.length; j++) {
        if (canonical[i + 1 + j] !== keyBytes[j]) { match = false; break; }
      }
      if (match) { headIdx = i; break; }
    }
    expect(headIdx).toBeGreaterThanOrEqual(0);
    const valueIdx = headIdx + 1 + keyBytes.length;
    const forged = new Uint8Array(canonical.length + 1);
    forged.set(canonical.subarray(0, valueIdx), 0);
    forged[valueIdx] = 0x18;
    forged[valueIdx + 1] = 0x01;
    forged.set(canonical.subarray(valueIdx + 1), valueIdx + 2);

    const capsulePath = join(workDir, 'noncanonical.shipcapsule.cbor');
    writeFileSync(capsulePath, forged);
    const { exit, receipt } = await captureVerify([tarballPath, '--capsule', capsulePath]);
    expect(exit).toBe(3);
    expect(receipt).not.toBeNull();
    expect(receipt!.verdict).toBe('Incomplete');
    expect(receipt!.mismatches.some((m) => m.startsWith('decode:non_canonical'))).toBe(true);
  });

  it('Incomplete (exit 3) when capsule bytes are truncated', async () => {
    const tmAddr = await run(tarballManifestAddress(tarballBytes));
    const capsule = await run(ShipCapsule.make(buildCapsuleInput(tmAddr, 1_715_500_000_003)));
    const canonical = ShipCapsule.canonicalize(capsule);
    const truncated = canonical.slice(0, Math.max(1, Math.floor(canonical.length / 3)));
    const capsulePath = join(workDir, 'truncated.shipcapsule.cbor');
    writeFileSync(capsulePath, truncated);
    const { exit, receipt } = await captureVerify([tarballPath, '--capsule', capsulePath]);
    expect(exit).toBe(3);
    expect(receipt).not.toBeNull();
    expect(receipt!.verdict).toBe('Incomplete');
    expect(receipt!.mismatches.some((m) => m.startsWith('decode:malformed_cbor'))).toBe(true);
  });

  it('Unknown (exit 4) when no --capsule is provided', async () => {
    const { exit, receipt } = await captureVerify([tarballPath]);
    expect(exit).toBe(4);
    expect(receipt).not.toBeNull();
    expect(receipt!.verdict).toBe('Unknown');
    expect(receipt!.checks.tarball_manifest).toBe('skipped');
  });
});

describe('czap verify error and edge paths', () => {
  it('parses --capsule=path equals form (Verified)', async () => {
    const tmAddr = await run(tarballManifestAddress(tarballBytes));
    const capsule = await run(ShipCapsule.make(buildCapsuleInput(tmAddr, 1_715_500_000_010)));
    const capsulePath = join(workDir, 'equals-form.shipcapsule.cbor');
    writeFileSync(capsulePath, ShipCapsule.canonicalize(capsule));

    const { exit, receipt } = await captureVerify([tarballPath, `--capsule=${capsulePath}`]);
    expect(exit).toBe(0);
    expect(receipt!.verdict).toBe('Verified');
  });

  it('exit 1 (emitError) when --capsule is provided but the positional tarball is missing', async () => {
    const tmAddr = await run(tarballManifestAddress(tarballBytes));
    const capsule = await run(ShipCapsule.make(buildCapsuleInput(tmAddr, 1_715_500_000_011)));
    const capsulePath = join(workDir, 'missing-tarball.shipcapsule.cbor');
    writeFileSync(capsulePath, ShipCapsule.canonicalize(capsule));

    const { exit, stderr } = await captureVerify(['--capsule', capsulePath]);
    expect(exit).toBe(1);
    const lines = stderr.split('\n').filter((l) => l.trim().length > 0);
    const err = JSON.parse(lines[lines.length - 1]!) as { status: string; command: string; error: string };
    expect(err.status).toBe('failed');
    expect(err.command).toBe('verify');
    expect(err.error).toBe('missing positional <tarball>');
  });

  it('exit 1 (emitError) when the tarball file does not exist on disk', async () => {
    const tmAddr = await run(tarballManifestAddress(tarballBytes));
    const capsule = await run(ShipCapsule.make(buildCapsuleInput(tmAddr, 1_715_500_000_012)));
    const capsulePath = join(workDir, 'tarball-not-found.shipcapsule.cbor');
    writeFileSync(capsulePath, ShipCapsule.canonicalize(capsule));

    const ghostTarball = join(workDir, 'does-not-exist.tgz');
    const { exit, stderr } = await captureVerify([ghostTarball, '--capsule', capsulePath]);
    expect(exit).toBe(1);
    const lines = stderr.split('\n').filter((l) => l.trim().length > 0);
    const err = JSON.parse(lines[lines.length - 1]!) as { error: string };
    expect(err.error).toMatch(/^tarball not found:/);
  });

  it('exit 1 (emitError) when the capsule file does not exist on disk', async () => {
    const ghostCapsule = join(workDir, 'does-not-exist.shipcapsule.cbor');
    const { exit, stderr } = await captureVerify([tarballPath, '--capsule', ghostCapsule]);
    expect(exit).toBe(1);
    const lines = stderr.split('\n').filter((l) => l.trim().length > 0);
    const err = JSON.parse(lines[lines.length - 1]!) as { error: string };
    expect(err.error).toMatch(/^capsule not found:/);
  });

  it('Incomplete (exit 3) with recompute: prefix when the tarball bytes are not valid gzip', async () => {
    const tmAddr = await run(tarballManifestAddress(tarballBytes));
    const capsule = await run(ShipCapsule.make(buildCapsuleInput(tmAddr, 1_715_500_000_013)));
    const capsulePath = join(workDir, 'recompute-fail.shipcapsule.cbor');
    writeFileSync(capsulePath, ShipCapsule.canonicalize(capsule));

    const notGzipPath = join(workDir, 'not-a-tarball.tgz');
    writeFileSync(notGzipPath, Buffer.from('this is plain text, not gzip-framed bytes'));

    const { exit, receipt } = await captureVerify([notGzipPath, '--capsule', capsulePath]);
    expect(exit).toBe(3);
    expect(receipt!.verdict).toBe('Incomplete');
    expect(receipt!.checks.tarball_manifest).toBe('skipped');
    expect(receipt!.mismatches.some((m) => m.startsWith('recompute:'))).toBe(true);
  });

  it('Incomplete (exit 3) with decode:invalid_shape when the capsule CBOR decodes but is the wrong shape', async () => {
    // Valid canonical CBOR for `{ "hello": "world" }` — decodes cleanly via
    // cborg, fails validateShape because it lacks _kind / schema_version / …
    // Exercises the third ShipCapsuleDecodeError tag (the existing tests
    // cover malformed_cbor and non_canonical).
    const wrongShape = new Uint8Array([
      0xa1, // map(1)
      0x65, 0x68, 0x65, 0x6c, 0x6c, 0x6f, // text(5) "hello"
      0x65, 0x77, 0x6f, 0x72, 0x6c, 0x64, // text(5) "world"
    ]);
    const capsulePath = join(workDir, 'invalid-shape.shipcapsule.cbor');
    writeFileSync(capsulePath, wrongShape);

    const { exit, receipt } = await captureVerify([tarballPath, '--capsule', capsulePath]);
    expect(exit).toBe(3);
    expect(receipt!.verdict).toBe('Incomplete');
    expect(receipt!.mismatches.some((m) => m === 'decode:invalid_shape')).toBe(true);
  });

  it('Mismatch (exit 2) when only integrity_digest differs (display_id matches) — each arm pushed independently', async () => {
    // Construct an AddressedDigest by hand that shares display_id with the
    // real tarball but has a deliberately-wrong integrity_digest. Exercises
    // the lines 164–165 arm in isolation from the lines 161–162 arm.
    const realAddr = await run(tarballManifestAddress(tarballBytes));
    const onlyDigestDiffers: AddressedDigest = {
      display_id: realAddr.display_id,
      integrity_digest: IntegrityDigest('sha256:' + 'f'.repeat(64)),
      algo: 'sha256',
    };
    const capsule = await run(ShipCapsule.make(buildCapsuleInput(onlyDigestDiffers, 1_715_500_000_014)));
    const capsulePath = join(workDir, 'digest-only-mismatch.shipcapsule.cbor');
    writeFileSync(capsulePath, ShipCapsule.canonicalize(capsule));

    const { exit, receipt } = await captureVerify([tarballPath, '--capsule', capsulePath]);
    expect(exit).toBe(2);
    expect(receipt!.verdict).toBe('Mismatch');
    expect(receipt!.mismatches).toEqual(['tarball_manifest_address.integrity_digest']);
  });
});
