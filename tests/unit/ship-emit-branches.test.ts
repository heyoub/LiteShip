/**
 * `cli.ship-emit` capsule (ADR-0011) — direct coverage of the
 * `receiptedMutation` arm's surface, bypassing `commands/ship.ts`.
 *
 * `commands/ship.ts` is excluded from coverage matching the existing
 * `bin.ts` / `http-server.ts` pattern, so the only way to hit the
 * branches in `capsules/ship-emit.ts` is to construct a valid
 * {@link ShipCapsule.Shape} and call into the capsule's surface
 * directly. This file covers:
 *
 *   - `ShipEmit.run` write-path success (ship-emit.ts:82-91) and
 *     `writeFileSync` failure (ENOENT on a missing parent directory).
 *   - `shipEmitCapsule.input` / `shipEmitCapsule.output` Schema
 *     accept + reject (ship-emit.ts:21-30).
 *   - The two invariant `check` functions (ship-emit.ts:58-74):
 *     `id-matches-bytes` (true / id-drift / path-drift) and
 *     `bytes-positive` (positive / zero / non-number).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Effect, Schema } from 'effect';
import {
  ContentAddress,
  IntegrityDigest,
  ShipCapsule,
  type AddressedDigest,
  type HLCBrand as HLC,
} from '@czap/core';
import { ShipEmit, shipEmitCapsule } from '../../packages/cli/src/capsules/ship-emit.js';

const run = <A, E>(eff: Effect.Effect<A, E>) => Effect.runPromise(eff);

const fakeDigest = (label: string): AddressedDigest => ({
  display_id: ContentAddress(`fnv1a:${label.padStart(8, '0').slice(0, 8)}`),
  integrity_digest: IntegrityDigest(`sha256:${label.padEnd(64, '0').slice(0, 64)}`),
  algo: 'sha256',
});

const sampleInput = (): ShipCapsule.Input => ({
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
  generated_at: { wall_ms: 1_715_500_000_000, counter: 0, node_id: 'test-emit' } as HLC,
  previous_ship_capsule: null,
});

let workDir: string;
let capsule: ShipCapsule.Shape;

beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), 'litesip-ship-emit-'));
  capsule = await run(ShipCapsule.make(sampleInput()));
});

afterAll(() => {
  if (workDir && existsSync(workDir)) {
    rmSync(workDir, { recursive: true, force: true });
  }
});

describe('ShipEmit.run write-path', () => {
  it('serializes to canonical CBOR + writes to disk on the happy path, and surfaces `writeFileSync` ENOENT when the parent dir is missing', () => {
    // Happy path: hits every return-field branch (ship-emit.ts:86-90) and
    // verifies bytes match `ShipCapsule.canonicalize(capsule)` on disk.
    const capsulePath = join(workDir, 'success.shipcapsule.cbor');
    const output = ShipEmit.run({ capsule, capsule_path: capsulePath });
    expect(output.capsule_path).toBe(capsulePath);
    expect(output.capsule_id).toBe(capsule.id);
    expect(output.bytes_written).toBeGreaterThan(0);
    expect(existsSync(capsulePath)).toBe(true);
    expect(statSync(capsulePath).size).toBe(output.bytes_written);
    const onDisk = new Uint8Array(readFileSync(capsulePath));
    const expectedBytes = ShipCapsule.canonicalize(capsule);
    expect(onDisk.length).toBe(expectedBytes.length);
    for (let i = 0; i < expectedBytes.length; i++) {
      expect(onDisk[i]).toBe(expectedBytes[i]);
    }

    // Failure path: writeFileSync to a missing dir throws ENOENT (ship-emit.ts:85).
    // The capsule has no try/catch — the caller (`commands/ship.ts:418`) catches.
    const missingDir = join(workDir, 'does-not-exist-yet');
    const failPath = join(missingDir, 'fail.shipcapsule.cbor');
    expect(() => ShipEmit.run({ capsule, capsule_path: failPath })).toThrow(/ENOENT/);
    expect(existsSync(failPath)).toBe(false);
  });
});

describe('shipEmitCapsule schema validation', () => {
  it('input / output Schemas accept well-formed shapes and reject malformed ones', async () => {
    // input Schema accept branch (ship-emit.ts:21-24).
    const okIn = await Effect.runPromise(
      Schema.decodeUnknownEffect(shipEmitCapsule.input)({
        capsule_path: '/tmp/x.shipcapsule.cbor',
        capsule_id: 'fnv1a:deadbeef',
      }),
    );
    expect(okIn.capsule_path).toBe('/tmp/x.shipcapsule.cbor');

    // input Schema reject branches: missing field, then wrong type.
    const missingField = await Effect.runPromiseExit(
      Schema.decodeUnknownEffect(shipEmitCapsule.input)({ capsule_path: '/tmp/x.cbor' } as unknown),
    );
    expect(missingField._tag).toBe('Failure');
    const wrongType = await Effect.runPromiseExit(
      Schema.decodeUnknownEffect(shipEmitCapsule.input)({
        capsule_path: 42,
        capsule_id: 'fnv1a:deadbeef',
      } as unknown),
    );
    expect(wrongType._tag).toBe('Failure');

    // output Schema accept branch (ship-emit.ts:26-30), fed by a real run() result.
    const capsulePath = join(workDir, 'output-schema.shipcapsule.cbor');
    const output = ShipEmit.run({ capsule, capsule_path: capsulePath });
    const okOut = await Effect.runPromise(Schema.decodeUnknownEffect(shipEmitCapsule.output)(output));
    expect(okOut.bytes_written).toBe(output.bytes_written);
    expect(okOut.capsule_path).toBe(output.capsule_path);
    expect(okOut.capsule_id).toBe(output.capsule_id);
  });
});

describe('shipEmitCapsule invariants', () => {
  it('`id-matches-bytes` and `bytes-positive` check functions cover their true and false branches', () => {
    const idMatches = shipEmitCapsule.invariants.find((i) => i.name === 'id-matches-bytes');
    const bytesPositive = shipEmitCapsule.invariants.find((i) => i.name === 'bytes-positive');
    expect(idMatches).toBeDefined();
    expect(bytesPositive).toBeDefined();
    const input = { capsule_path: '/a/b.cbor', capsule_id: 'fnv1a:deadbeef' };

    // id-matches-bytes (ship-emit.ts:60-63): true when both echo through,
    // false when either id or path mutates in flight.
    expect(
      idMatches!.check!(input, { capsule_path: '/a/b.cbor', capsule_id: 'fnv1a:deadbeef', bytes_written: 42 }),
    ).toBe(true);
    expect(
      idMatches!.check!(input, { capsule_path: '/a/b.cbor', capsule_id: 'fnv1a:cafef00d', bytes_written: 42 }),
    ).toBe(false);
    expect(
      idMatches!.check!(input, { capsule_path: '/a/different.cbor', capsule_id: 'fnv1a:deadbeef', bytes_written: 42 }),
    ).toBe(false);

    // bytes-positive (ship-emit.ts:68-72): exercises both conjuncts of
    // `typeof === 'number' && > 0` — positive (true), zero (false),
    // negative (false), and non-number (false).
    expect(
      bytesPositive!.check!(input, { capsule_path: '/a/b.cbor', capsule_id: 'fnv1a:deadbeef', bytes_written: 1 }),
    ).toBe(true);
    expect(
      bytesPositive!.check!(input, { capsule_path: '/a/b.cbor', capsule_id: 'fnv1a:deadbeef', bytes_written: 0 }),
    ).toBe(false);
    expect(
      bytesPositive!.check!(input, { capsule_path: '/a/b.cbor', capsule_id: 'fnv1a:deadbeef', bytes_written: -1 }),
    ).toBe(false);
    expect(
      bytesPositive!.check!(input, {
        capsule_path: '/a/b.cbor',
        capsule_id: 'fnv1a:deadbeef',
        bytes_written: 'oops' as unknown as number,
      }),
    ).toBe(false);
  });
});
