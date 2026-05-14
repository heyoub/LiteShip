/**
 * ShipCapsule — release-artifact receipt (ADR-0011).
 *
 * Same canonical-CBOR + ContentAddress kernel as runtime primitives, applied
 * to a published-package tarball. `id` is the fnv1a label over the
 * canonical bytes of every field except `id` and `integrity`; `integrity`
 * pairs that label with a sha256 digest over the same bytes.
 *
 * @module
 */

import { Effect } from 'effect';
import { decode as cborDecode } from 'cborg';
import type { AddressedDigest, ContentAddress, HLC } from './brands.js';
import { CanonicalCbor } from './cbor.js';
import { AddressedDigest as AddressedDigestNs } from './addressed-digest.js';

interface ShipCapsuleBuildEnv {
  readonly node_version: string;
  readonly pnpm_version: string;
  readonly os: 'linux' | 'darwin' | 'win32';
  readonly arch: 'x64' | 'arm64';
}

interface ShipCapsuleShape {
  readonly _kind: 'shipCapsule';
  readonly schema_version: 1;
  readonly id: ContentAddress;
  readonly integrity: AddressedDigest;
  readonly package_name: string;
  readonly package_version: string;
  readonly source_commit: string;
  readonly source_dirty: boolean;
  readonly lockfile_address: AddressedDigest;
  readonly workspace_manifest_address: AddressedDigest;
  readonly tarball_manifest_address: AddressedDigest;
  readonly build_env: ShipCapsuleBuildEnv;
  readonly package_manager: 'pnpm';
  readonly package_manager_version: string;
  readonly publish_dry_run_address: AddressedDigest;
  readonly lifecycle_scripts_observed: readonly string[];
  readonly generated_at: HLC;
  readonly previous_ship_capsule: ContentAddress | null;
}

type ShipCapsuleInput = Omit<ShipCapsuleShape, 'id' | 'integrity'>;

type ShipCapsuleDecodeError = 'non_canonical' | 'malformed_cbor' | 'invalid_shape';

const REQUIRED_KEYS: readonly (keyof ShipCapsuleShape)[] = [
  '_kind',
  'schema_version',
  'id',
  'integrity',
  'package_name',
  'package_version',
  'source_commit',
  'source_dirty',
  'lockfile_address',
  'workspace_manifest_address',
  'tarball_manifest_address',
  'build_env',
  'package_manager',
  'package_manager_version',
  'publish_dry_run_address',
  'lifecycle_scripts_observed',
  'generated_at',
  'previous_ship_capsule',
];

const encodeIdentityBearing = (capsule: ShipCapsuleInput): Uint8Array =>
  CanonicalCbor.encode({
    _kind: capsule._kind,
    schema_version: capsule.schema_version,
    package_name: capsule.package_name,
    package_version: capsule.package_version,
    source_commit: capsule.source_commit,
    source_dirty: capsule.source_dirty,
    lockfile_address: capsule.lockfile_address,
    workspace_manifest_address: capsule.workspace_manifest_address,
    tarball_manifest_address: capsule.tarball_manifest_address,
    build_env: capsule.build_env,
    package_manager: capsule.package_manager,
    package_manager_version: capsule.package_manager_version,
    publish_dry_run_address: capsule.publish_dry_run_address,
    lifecycle_scripts_observed: capsule.lifecycle_scripts_observed,
    generated_at: capsule.generated_at,
    previous_ship_capsule: capsule.previous_ship_capsule,
  });

const computeId = (capsuleWithoutIdentity: ShipCapsuleInput): Effect.Effect<AddressedDigest, Error> =>
  AddressedDigestNs.of(encodeIdentityBearing(capsuleWithoutIdentity));

const make = (input: ShipCapsuleInput): Effect.Effect<ShipCapsuleShape, Error> =>
  Effect.gen(function* () {
    const digest = yield* computeId(input);
    return {
      _kind: input._kind,
      schema_version: input.schema_version,
      id: digest.display_id,
      integrity: digest,
      package_name: input.package_name,
      package_version: input.package_version,
      source_commit: input.source_commit,
      source_dirty: input.source_dirty,
      lockfile_address: input.lockfile_address,
      workspace_manifest_address: input.workspace_manifest_address,
      tarball_manifest_address: input.tarball_manifest_address,
      build_env: input.build_env,
      package_manager: input.package_manager,
      package_manager_version: input.package_manager_version,
      publish_dry_run_address: input.publish_dry_run_address,
      lifecycle_scripts_observed: input.lifecycle_scripts_observed,
      generated_at: input.generated_at,
      previous_ship_capsule: input.previous_ship_capsule,
    };
  });

const canonicalize = (capsule: ShipCapsuleShape): Uint8Array =>
  CanonicalCbor.encode({
    _kind: capsule._kind,
    schema_version: capsule.schema_version,
    id: capsule.id,
    integrity: capsule.integrity,
    package_name: capsule.package_name,
    package_version: capsule.package_version,
    source_commit: capsule.source_commit,
    source_dirty: capsule.source_dirty,
    lockfile_address: capsule.lockfile_address,
    workspace_manifest_address: capsule.workspace_manifest_address,
    tarball_manifest_address: capsule.tarball_manifest_address,
    build_env: capsule.build_env,
    package_manager: capsule.package_manager,
    package_manager_version: capsule.package_manager_version,
    publish_dry_run_address: capsule.publish_dry_run_address,
    lifecycle_scripts_observed: capsule.lifecycle_scripts_observed,
    generated_at: capsule.generated_at,
    previous_ship_capsule: capsule.previous_ship_capsule,
  });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const validateShape = (value: unknown): value is ShipCapsuleShape => {
  if (!isRecord(value)) return false;
  for (const k of REQUIRED_KEYS) {
    if (!(k in value)) return false;
  }
  if (value._kind !== 'shipCapsule') return false;
  if (value.schema_version !== 1) return false;
  if (!isRecord(value.integrity)) return false;
  if (!isRecord(value.build_env)) return false;
  if (!Array.isArray(value.lifecycle_scripts_observed)) return false;
  if (!isRecord(value.generated_at)) return false;
  return true;
};

const decode = (bytes: Uint8Array): Effect.Effect<ShipCapsuleShape, ShipCapsuleDecodeError> =>
  Effect.gen(function* () {
    let decoded: unknown;
    try {
      decoded = cborDecode(bytes);
    } catch {
      return yield* Effect.fail('malformed_cbor' as const);
    }
    if (!validateShape(decoded)) {
      return yield* Effect.fail('invalid_shape' as const);
    }
    const reencoded = canonicalize(decoded);
    if (reencoded.length !== bytes.length) {
      return yield* Effect.fail('non_canonical' as const);
    }
    for (let i = 0; i < reencoded.length; i++) {
      if (reencoded[i] !== bytes[i]) {
        return yield* Effect.fail('non_canonical' as const);
      }
    }
    return decoded;
  });

/**
 * Public namespace for ShipCapsule (ADR-0011). `make` builds a capsule from
 * input, `canonicalize` encodes it as canonical CBOR for transport / hashing,
 * `decode` round-trips canonical bytes and rejects non-canonical encodings,
 * `computeId` mints the fnv1a label over the canonicalized payload.
 */
export const ShipCapsule = { make, canonicalize, decode, computeId };

export declare namespace ShipCapsule {
  /** Decoded capsule shape returned by {@link ShipCapsule.make} and {@link ShipCapsule.decode}. */
  export type Shape = ShipCapsuleShape;
  /** Constructor input accepted by {@link ShipCapsule.make} (capsule without `id` / `integrity`). */
  export type Input = ShipCapsuleInput;
  /** Tagged failure variants {@link ShipCapsule.decode} can produce. */
  export type DecodeError = ShipCapsuleDecodeError;
  /** Node / pnpm / OS / arch tuple captured in the capsule's `build_env`. */
  export type BuildEnv = ShipCapsuleBuildEnv;
}
