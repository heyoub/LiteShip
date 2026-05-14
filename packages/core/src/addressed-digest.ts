/**
 * AddressedDigest construction — pair a {@link ContentAddress} (fnv1a) with an
 * {@link IntegrityDigest} (sha256) over the same canonical bytes (ADR-0011).
 *
 * @module
 */

import { Effect } from 'effect';
import type { AddressedDigest as _AddressedDigest } from './brands.js';
import { IntegrityDigest as mkIntegrityDigest } from './brands.js';
import { fnv1aBytes } from './fnv.js';

/** Pair of an fnv1a {@link ContentAddress} and a strong digest over the same canonical bytes. */
export type AddressedDigest = _AddressedDigest;

const bytesToHex = (bytes: Uint8Array): string => {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i]!.toString(16).padStart(2, '0');
  }
  return out;
};

const sha256Hex = (bytes: Uint8Array): Effect.Effect<string> =>
  Effect.tryPromise({
    try: async () => {
      const buffer = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
      return bytesToHex(new Uint8Array(buffer));
    },
    catch: (error) => new Error(`SHA-256 hash failed: ${error instanceof Error ? error.message : String(error)}`),
  }).pipe(Effect.orDie);

/** Derive an {@link AddressedDigest} from raw bytes. v0.1.0 implements `sha256` only. */
export const AddressedDigestOf = (
  bytes: Uint8Array,
  algo: 'sha256' | 'blake3' = 'sha256',
): Effect.Effect<_AddressedDigest, Error> =>
  Effect.gen(function* () {
    if (algo !== 'sha256') {
      return yield* Effect.fail(new Error(`AddressedDigest: algo "${algo}" not yet implemented (v0.2)`));
    }
    const display_id = fnv1aBytes(bytes);
    const hex = yield* sha256Hex(bytes);
    const integrity_digest = mkIntegrityDigest(`sha256:${hex}`);
    return { display_id, integrity_digest, algo: 'sha256' as const };
  });

/** Namespace surface: call {@link AddressedDigest.of} to mint a digest pair from raw bytes. */
export const AddressedDigest = { of: AddressedDigestOf };
