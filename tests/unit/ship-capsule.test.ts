/**
 * ShipCapsule -- make / canonicalize / decode round-trips, identity
 * agreement, and decode error verdicts (ADR-0011 §Decision item 3).
 */

import { describe, it, expect } from 'vitest';
import { Effect } from 'effect';
import {
  ContentAddress,
  IntegrityDigest,
  ShipCapsule,
  type AddressedDigest,
  type HLCBrand as HLC,
} from '@czap/core';
import { encode as cborEncode } from 'cborg';

const run = <A, E>(eff: Effect.Effect<A, E>) => Effect.runPromise(eff);

const fakeDigest = (label: string): AddressedDigest => ({
  display_id: ContentAddress(`fnv1a:${'0'.repeat(8 - label.length)}${label}`.slice(0, 14)),
  integrity_digest: IntegrityDigest(`sha256:${label.padEnd(64, '0').slice(0, 64)}`),
  algo: 'sha256',
});

const sampleInput = (overrides: Partial<ShipCapsule.Input> = {}): ShipCapsule.Input => ({
  _kind: 'shipCapsule',
  schema_version: 1,
  package_name: '@czap/_spine',
  package_version: '0.1.0',
  source_commit: '0123456789abcdef0123456789abcdef01234567',
  source_dirty: false,
  lockfile_address: fakeDigest('aaaaaaaa'),
  workspace_manifest_address: fakeDigest('bbbbbbbb'),
  tarball_manifest_address: fakeDigest('cccccccc'),
  build_env: {
    node_version: 'v24.13.1',
    pnpm_version: '10.32.1',
    os: 'linux',
    arch: 'x64',
  },
  package_manager: 'pnpm',
  package_manager_version: '10.32.1',
  publish_dry_run_address: fakeDigest('dddddddd'),
  lifecycle_scripts_observed: [],
  generated_at: { wall_ms: 1_715_500_000_000, counter: 0, node_id: 'test-node' } as HLC,
  previous_ship_capsule: null,
  ...overrides,
});

describe('ShipCapsule.make', () => {
  it('round-trips through canonicalize → decode preserving every input field', async () => {
    const input = sampleInput();
    const capsule = await run(ShipCapsule.make(input));
    const bytes = ShipCapsule.canonicalize(capsule);
    const decoded = await run(ShipCapsule.decode(bytes));
    expect(decoded).toEqual(capsule);
  });

  it('produces id equal to integrity.display_id (same canonical bytes, two hashes)', async () => {
    const capsule = await run(ShipCapsule.make(sampleInput()));
    expect(capsule.id).toBe(capsule.integrity.display_id);
    expect(capsule.integrity.integrity_digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(capsule.integrity.algo).toBe('sha256');
  });

  it('canonicalize is deterministic (byte-equal on repeated calls)', async () => {
    const capsule = await run(ShipCapsule.make(sampleInput()));
    const a = ShipCapsule.canonicalize(capsule);
    const b = ShipCapsule.canonicalize(capsule);
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i++) {
      expect(a[i]).toBe(b[i]);
    }
  });

  it('two makes with different generated_at.wall_ms produce different ids', async () => {
    // "ship event identity vs artifact identity" — generated_at is part of identity.
    const base = sampleInput();
    const t1 = await run(
      ShipCapsule.make({
        ...base,
        generated_at: { ...base.generated_at, wall_ms: 1_715_500_000_000 } as HLC,
      }),
    );
    const t2 = await run(
      ShipCapsule.make({
        ...base,
        generated_at: { ...base.generated_at, wall_ms: 1_715_500_000_001 } as HLC,
      }),
    );
    expect(t1.id).not.toBe(t2.id);
    expect(t1.integrity.integrity_digest).not.toBe(t2.integrity.integrity_digest);
  });
});

describe('ShipCapsule.decode error paths', () => {
  it('truncated bytes fail with malformed_cbor', async () => {
    const capsule = await run(ShipCapsule.make(sampleInput()));
    const bytes = ShipCapsule.canonicalize(capsule);
    const truncated = bytes.slice(0, Math.max(1, Math.floor(bytes.length / 3)));
    const exit = await Effect.runPromiseExit(ShipCapsule.decode(truncated));
    expect(exit._tag).toBe('Failure');
    const err = await Effect.runPromise(ShipCapsule.decode(truncated).pipe(Effect.flip));
    expect(err).toBe('malformed_cbor');
  });

  it('non-canonical bytes (longer-form schema_version) fail with non_canonical', async () => {
    // Forge a non-canonical encoding by replacing the schema_version value byte
    // (canonical: 0x01) with its longer-form equivalent (0x18 0x01). Both decode
    // to the integer 1, so cborg accepts and the shape validates; canonicalize
    // then re-emits the shorter form, so reencoded.length < bytes.length and the
    // bytes-equal check trips → 'non_canonical'.
    const capsule = await run(ShipCapsule.make(sampleInput()));
    const bytes = ShipCapsule.canonicalize(capsule);
    // Search for the bytes corresponding to the key "schema_version" (len 14,
    // CBOR head 0x6E). The byte immediately following the 14 chars is the value.
    const key = 'schema_version';
    const keyBytes = new TextEncoder().encode(key);
    let headIdx = -1;
    for (let i = 0; i + keyBytes.length + 2 < bytes.length; i++) {
      if (bytes[i] !== 0x6e) continue;
      let match = true;
      for (let j = 0; j < keyBytes.length; j++) {
        if (bytes[i + 1 + j] !== keyBytes[j]) { match = false; break; }
      }
      if (match) { headIdx = i; break; }
    }
    expect(headIdx).toBeGreaterThanOrEqual(0);
    const valueIdx = headIdx + 1 + keyBytes.length;
    expect(bytes[valueIdx]).toBe(0x01);
    const forged = new Uint8Array(bytes.length + 1);
    forged.set(bytes.subarray(0, valueIdx), 0);
    forged[valueIdx] = 0x18; // major 0, additional info 24 (uint8 head)
    forged[valueIdx + 1] = 0x01;
    forged.set(bytes.subarray(valueIdx + 1), valueIdx + 2);

    const exit = await Effect.runPromiseExit(ShipCapsule.decode(forged));
    expect(exit._tag).toBe('Failure');
    const err = await Effect.runPromise(ShipCapsule.decode(forged).pipe(Effect.flip));
    expect(err).toBe('non_canonical');
  });

  it('valid CBOR with wrong shape fails with invalid_shape', async () => {
    const wrongShape = cborEncode({ not: 'a capsule', schema_version: 99 });
    const exit = await Effect.runPromiseExit(ShipCapsule.decode(new Uint8Array(wrongShape)));
    expect(exit._tag).toBe('Failure');
    const err = await Effect.runPromise(ShipCapsule.decode(new Uint8Array(wrongShape)).pipe(Effect.flip));
    expect(err).toBe('invalid_shape');
  });

  it('schema_version other than 1 is rejected with invalid_shape', async () => {
    // Forced cast to drill schema-evolution handling without bypassing the type
    // system at the decode boundary. v0.1.0 locks schema_version === 1.
    const input = sampleInput() as ShipCapsule.Input & { schema_version: number };
    input.schema_version = 2;
    const capsule = await run(ShipCapsule.make(input as ShipCapsule.Input));
    const bytes = ShipCapsule.canonicalize(capsule);
    const err = await Effect.runPromise(ShipCapsule.decode(bytes).pipe(Effect.flip));
    expect(err).toBe('invalid_shape');
  });
});
