# ADR-0003 — Content addressing via FNV-1a + CBOR

**Status:** Accepted
**Date:** 2026-04-21

## Context

CZAP primitives (Boundaries, Quantizer configs, Receipts, GenFrames, Tokens, Themes) need stable identity that tracks definition changes. Caching (edge KV, HMR memoization, compositor reconciliation) depends on being able to ask "is this definition the same one I already processed?" without structural walks. The same definition on two different machines (dev laptop and edge worker) must produce the same identifier. Changing any field of a definition must change the identifier.

## Decision

Identity is `fnv1a:XXXXXXXX`: a 32-bit FNV-1a hash of the CBOR-canonical serialization of the payload, wrapped in the branded `ContentAddress` type (see ADR-0001). SHA-256 via `crypto.subtle.digest` is available for security-sensitive contexts (see `typed-ref.ts`, used for `schema_hash` and `content_hash` of typed references).

## Consequences

- **Deterministic and cross-machine stable.** CBOR normalizes key ordering, integer canonicalization, and floating-point representation; two machines produce the same bytes, therefore the same hash.
- **Cheap to compute.** FNV-1a via `Math.imul` for 32-bit hashing (`packages/core/src/fnv.ts`). Suitable for per-definition use throughout the build pipeline without measurable overhead.
- **Collision probability at 32 bits is ~1 in 4B.** Acceptable for content-identity within a single app; not cryptographic. SHA-256 via `typed-ref.ts` covers signature-grade needs.
- **Automatic cache invalidation.** Hash-indexed caches (`quantizer/src/memo-cache.ts`) invalidate correctly on any definition change. There is no stale-cache failure mode where the key survives a semantic change.
- **Reliable edge/CDN behavior.** Same definition on different machines → same hash → same cached output.

## Evidence

- `packages/core/src/fnv.ts`: FNV-1a implementation for strings and byte arrays.
- `packages/core/src/typed-ref.ts`: SHA-256 content hashing for typed references.
- `packages/quantizer/src/memo-cache.ts`: hash-indexed cache consumer.
- Used by Boundary, Token, Style, Theme, Receipt, GenFrame (see each module's `make` function).
- `tests/property/content-address.prop.test.ts`: fast-check property test verifying hash stability across structurally-equivalent inputs.

## Rejected alternatives

- **SHA-256 for all identity**: overkill and measurably slower for non-cryptographic identity; reserved for signature-grade needs.
- **`JSON.stringify`**: key-order nondeterminism across engines; unusable for cross-machine identity.
- **Structural equality**: no stable identifier, no cache key, no edge-cacheable output.

## References

- `packages/core/src/fnv.ts`: hashing
- `packages/core/src/brands.ts`: `ContentAddress` brand
- `packages/core/src/typed-ref.ts`: SHA-256 path
- `packages/core/src/receipt.ts`, `gen-frame.ts`: consumers
- `tests/property/content-address.prop.test.ts`: stability property test
- ADR-0001: branded types

## Implementation status (2026-04-24)

Content addressing routes through `CanonicalCbor.encode` (RFC 8949
§4.2.1 canonical form): map keys lex-sorted by encoded byte order,
shortest-form integer encoding, definite-length arrays/maps, integer
form preferred over float when value is representable. The byte
output feeds into `fnv1aBytes` to produce the `ContentAddress` brand.

Previously the implementation used `JSON.stringify` for the payload
serialization, which was key-order dependent and platform-quirk
sensitive. Stabilizing on canonical CBOR closes that drift.

The encoder lives at `packages/core/src/cbor.ts` and is registered
as the `core.canonical-cbor` `pureTransform` arm capsule
(`packages/core/src/capsules/canonical-cbor.ts`). It runs under
property-based tests over RFC 8949 Appendix A vectors plus key-order
stability and integer-form preference (`tests/unit/cbor.test.ts`,
`tests/generated/core-canonical-cbor.test.ts`).

The capsule factory's own `computeId` (`packages/core/src/assembly.ts`
L22-37) is the canonical example: it CBOR-encodes the contract's
identity-bearing fields then hashes with `fnv1aBytes`, so even the
catalog that defines the 7 arms uses the canonical content-address
path it advertises.

CLI idempotency (`packages/cli/src/idempotency.ts`) routes through
the same encoder so `czap` command receipts remain stable across
key-order permutations on disk.
