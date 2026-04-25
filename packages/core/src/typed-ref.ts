/**
 * TypedRef -- content-addressed payload references.
 *
 * Uses CBOR canonical encoding (cborg) and SHA-256 via crypto.subtle.
 *
 * @module
 */

import { Effect } from 'effect';
import { encode } from 'cborg';

// Content-addressed identity: CBOR-canonical payload → FNV-1a hash. Same definition = same address.

interface TypedRefShape {
  readonly schema_hash: string;
  readonly content_hash: string;
}

/** Canonicalize value to CBOR bytes using canonical (deterministic) encoding. */
export const canonicalize = (value: unknown): Uint8Array => encode(value);

/**
 * Hash data using SHA-256. Returns "sha256:hex" formatted hash.
 *
 * The `bytes as BufferSource` assertion is the single sanctioned cast in this
 * file. `Uint8Array` is structurally a BufferSource, but TS's DOM lib types
 * `bytes.buffer` as potentially-SharedArrayBuffer, preventing direct assignment.
 * Safe: cborg encodes into fresh ArrayBuffer and TextEncoder.encode returns
 * ArrayBuffer-backed views. No data copy.
 *
 * Hash-primitive failures are unrecoverable in practice (crypto.subtle errors
 * are environment-level, not user-recoverable), so we `Effect.orDie` to fold
 * the Error channel into a defect and keep the `Effect<string>` signature that
 * the content-addressing pipeline relies on.
 */
export const hash = (data: string | Uint8Array): Effect.Effect<string> =>
  Effect.tryPromise({
    try: async () => {
      const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
      const buffer = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
      const hashHex = Array.from(new Uint8Array(buffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      return `sha256:${hashHex}`;
    },
    catch: (error) => new Error(`SHA-256 hash failed: ${error instanceof Error ? error.message : String(error)}`),
  }).pipe(Effect.orDie);

/** Create a TypedRef from schema hash and payload. */
const _create = (schemaHash: string, payload: unknown): Effect.Effect<TypedRefShape> =>
  Effect.gen(function* () {
    const contentHash = yield* hash(canonicalize(payload));
    return { schema_hash: schemaHash, content_hash: contentHash };
  });

/** Compare two TypedRefs for structural equality. */
const _equals = (a: TypedRefShape, b: TypedRefShape): boolean =>
  a.schema_hash === b.schema_hash && a.content_hash === b.content_hash;

/**
 * TypedRef — schema-plus-content-hash pointer used by the receipt pipeline.
 * Lets a receipt reference a payload by its content address without embedding
 * the payload itself, while still binding it to a schema identity.
 */
export const TypedRef = {
  /** Build a {@link TypedRef} from a schema hash and an arbitrary payload. */
  create: _create,
  /** Structural equality over schema + content hashes. */
  equals: _equals,
  /** Canonical-CBOR-ish serialization used to compute the content hash. */
  canonicalize,
  /** Hash a canonicalized payload to its content address. */
  hash,
};

export declare namespace TypedRef {
  /** Structural shape of a typed reference: schema hash + content hash. */
  export type Shape = TypedRefShape;
}
