# ADR-0011 — ShipCapsule: content-addressing crosses into release artifacts

**Status:** Accepted
**Date:** 2026-05-12
**Audience:** Contributors who touch the publish pipeline, the CLI, or anything that produces a release artifact. Also: anyone who reads ADR-0003 and wonders what changes when the receipt primitive leaves the runtime.

## Context

LiteShip's content-addressing doctrine (ADR-0003) was sized for runtime artifacts: Boundary, Token, Style, Theme, Plan, GenFrame, Receipt. Every primitive carries a `ContentAddress` of shape `fnv1a:XXXXXXXX` over its CBOR-canonical payload (`packages/core/src/cbor.ts`, `packages/core/src/fnv.ts`). Definition changes propagate through identity, caches invalidate, edges agree. The doctrine has never had to face an attacker because it has never been the identity of a thing a stranger downloads.

That changes at v0.1.0. The TanStack supply-chain worm (May 11, 2026, 84 malicious versions across 42 `@tanstack/*` packages, valid SLSA provenance over a hijacked build pipeline) made the question "why should anyone trust this package" load-bearing for every new npm publisher. Receipts that already content-address what LiteShip *computes* should also content-address what LiteShip *ships*. The same canonical-CBOR + ContentAddress kernel is the natural carrier.

## Decision

Introduce `ShipCapsule`: a new artifact class describing a published package tarball. Same canonical-CBOR encoding, same `ContentAddress` identity shape, plus a sibling cryptographic digest for tamper evidence over external artifacts.

Concretely:

1. **`IntegrityDigest` brand**, format `sha256:<64-hex>` or `blake3:<64-hex>`. Declared in `_spine/core.d.ts` per ADR-0010, re-exported from `packages/core/src/brands.ts`.
2. **`AddressedDigest` interface**: `{ display_id: ContentAddress, integrity_digest: IntegrityDigest, algo: 'sha256' | 'blake3' }`. Same canonical bytes, hashed twice — fnv1a for the ergonomic label, sha256/blake3 for the lock.
3. **`ShipCapsule` type** (`packages/core/src/ship-capsule.ts`): subject (package name/version, source commit), inputs (lockfile, workspace manifest, tarball manifest, dry-run output — each carried as `AddressedDigest`), bounded build_env fingerprint, observed lifecycle scripts, HLC `generated_at`, and `previous_ship_capsule` for the chain.
4. **`czap ship`** CLI verb: wraps `pnpm publish`, computes the ShipCapsule, emits `<pkg>-<version>.shipcapsule.cbor` next to the tarball, then performs the publish. One owner of the lifecycle; no per-package `prepack`/`postpack` duplication.
5. **`czap verify <tarball> --capsule <file>`**: local-only verification in v0.1.0. Four verdicts — `Verified` (0), `Mismatch` (2), `Incomplete` (3), `Unknown` (4). "Unknown" is a first-class outcome: no capsule available means *we can't tell you*, which is honest software.

`ContentAddress` itself is **not** changed. The existing brand `string & { readonly [ContentAddressBrand]: true }` (`_spine/core.d.ts:51`) stays exactly as it is. ADR-0003 stays intact. The new `AddressedDigest` is a sibling type that *pairs* a `ContentAddress` with a cryptographic digest over the same bytes, used only where external artifacts are addressed.

SHA-256 ships in v0.1.0 (`crypto.subtle.digest('SHA-256', ...)` is already in the tree via `typed-ref.ts`). BLAKE3 is the v0.2 destination, landing in `crates/czap-compute/` alongside the existing `#![no_std]` kernels. The `algo` field exists from day one so the format does not break when BLAKE3 lands.

## What ShipCapsule is not

Three disambiguations the next reviewer will ask for:

- **Not Sentinel.** Sentinel is the future sibling product that watches hostile-world behavior on dev machines and CI runners (process lineage, persistence-surface mutation, honeytokens, evidence packets). ShipCapsule is the publisher-side complement: it is the clean-publish receipt that Sentinel can later consume as ground truth. LiteShip stays a framework; Sentinel stays separate. The capsule format is shaped so Sentinel can ingest it without LiteShip knowing Sentinel exists.
- **Not a security sidecar.** No `@czap/security`, no `@czap/sentinel`, no `@czap/provenance` package. The type lives in `@czap/core` next to `capsule.ts` / `receipt.ts` / `typed-ref.ts`. The CLI verbs live in `@czap/cli` next to other commands. Filing it as a separate package would smuggle in the "security feature stapled on after Shai-Hulud" framing this ADR explicitly rejects.
- **Not an 8th assembly arm.** ADR-0008 closes the capsule catalog at seven (`pureTransform`, `receiptedMutation`, `stateMachine`, `siteAdapter`, `policyGate`, `cachedProjection`, `sceneComposition`). ShipCapsule is a release-artifact class, not a runtime assembly archetype. The emission *capsule* (`packages/cli/src/capsules/ship-emit.ts`) is a `receiptedMutation`, reusing the existing arm. The ADR-0008 closure rule is preserved.

## Consequences

- **LiteShip's first externally-verifiable receipt.** Until v0.1.0 every `ContentAddress` was internal. After v0.1.0 every published tarball can be content-addressed by a third party with `czap verify`.
- **No breaking change for existing consumers.** `ContentAddress`, the FNV-1a regex property test (`tests/property/content-address.prop.test.ts`), and the 51 source files that hold `ContentAddress` as a flat branded string all stay untouched. `AddressedDigest` is purely additive.
- **No new runtime dependencies.** SHA-256 via `crypto.subtle.digest` is already used by `typed-ref.ts`. CBOR encode is in `cbor.ts`; decode for verify routes through `cborg` (already a `@czap/core` dependency). Tar streaming for tarball manifests adds at most one small dep (`tar-stream`).
- **No new package boundary.** `@czap/core` and `@czap/cli` grow; no new publish surface to coordinate, no new semver to manage.
- **Web developers get substrate-grade receipts without leaving the web.** That posture is doctrinal, not branding: ShipCapsule is the same primitive that already runs inside LiteShip, applied to a new artifact class.
- **Sentinel-ready evidence format.** The capsule chain (`previous_ship_capsule`) and the canonical-CBOR encoding mean future Sentinel ingestion is a parser, not a redesign. ShipCapsule is the publisher half of a system whose intrusion-detection half does not yet exist.
- **`pnpm pack` non-determinism is handled at the manifest layer, not the tarball layer.** Gzip timestamps make raw `.tgz` bytes vary across publish runs; the `tarball_manifest_address` is computed over the sorted uncompressed file manifest (path + size + sha256), so two clean publishes of the same source produce the same address.

## Supporting evidence

- `packages/core/src/cbor.ts`: canonical-CBOR encoder used by every `ContentAddress` derivation (ADR-0003 implementation status).
- `packages/core/src/fnv.ts`, `packages/core/src/typed-ref.ts`: existing dual-dialect hashing (fnv1a for identity, sha256 for security-grade content hashes). The dual-hash split is already in the tree; ShipCapsule consolidates it as a typed pair.
- `packages/core/src/assembly.ts:22-37`: `computeId` is the canonical pattern ShipCapsule mirrors — CBOR-encode identity-bearing fields, hash with `fnv1aBytes`.
- `packages/_spine/core.d.ts:34-57`: brand-declaration site for the next sibling (`IntegrityDigestBrand`, `AddressedDigest`).
- `packages/core/src/brands.ts:18-69`: re-export pattern (`import type X as _X` + `export type X = _X` + runtime constructor) that the new brands follow per ADR-0010.
- `packages/cli/src/capsules/`: existing `receiptedMutation` capsule pattern (`vitest-runner.ts`) that `ship-emit.ts` follows.

## Rejected alternatives

- **Evolve `ContentAddress` itself into an object** with `display_id` + `integrity_digest` fields. Rejected: 51 source files read `ContentAddress` as a flat branded string, and `tests/property/content-address.prop.test.ts` asserts the regex `^fnv1a:[0-9a-f]{8}$`. Day-of-release object migration is not load-bearing risk worth taking. `AddressedDigest` as a sibling type achieves the same doctrinal claim — "same canonical bytes, hashed twice" — additively.
- **`@czap/security` (or `@czap/sentinel`, or `@czap/provenance`) sibling package.** Rejected: this is the security-sidecar framing the surrounding decision explicitly rejects. ShipCapsule is an extension of the existing receipt primitive, not a separate concern bolted on.
- **`prepack` hook in each package.json.** Rejected: prepack runs before the tarball exists, so `tarball_manifest_address` cannot be computed; also fires on local `pnpm pack` (e.g. `pnpm run package:smoke`), which would mint spurious ShipCapsules during development.
- **`postpack` hook in each package.json.** Rejected: not guaranteed to fire on `pnpm publish` across pnpm versions; duplicates identical discipline across 14 package.jsons; no single owner of the lifecycle.
- **Inside-tarball capsule placement.** Rejected: chicken-and-egg. `tarball_manifest_address` is computed over the tarball's contents; the capsule cannot live inside the artifact it addresses.
- **Defer `czap verify` to v0.1.1, emission-only in v0.1.0.** Rejected: leaves v0.1.0 with a black-box recorder that nothing can read. Local-only verify is small (decode + recompute + compare; no network) and closes the doctrinal loop on day one. The richer verify (GitHub release-asset lookup, registry fetch, capsule chain validation) is still deferred to v0.1.1.
- **BLAKE3 in v0.1.0.** Rejected: WASM build wiring (Rust crate, `wasm-bindgen` path, dispatch) is not worth the v0.1.0 schedule risk when SHA-256 via `crypto.subtle` is already in the tree. The `algo` field on `AddressedDigest` makes BLAKE3 a v0.2 add without a format break.
- **Auto-routing emission to abuse desks / external reporting.** Rejected: explicitly out of scope. ShipCapsule generates evidence; humans route it. Cried-wolf at npm/GitHub abuse desks erodes the credibility that real incident reports depend on.

## References

- ADR-0001: branded types (`_spine` brand declaration discipline that `IntegrityDigest` follows)
- ADR-0003: content addressing via FNV-1a + CBOR (`ContentAddress` unchanged; `AddressedDigest` is the additive carrier for external artifacts)
- ADR-0008: capsule assembly catalog (closure rule preserved; ShipCapsule's emission is a `receiptedMutation`, not a new arm)
- ADR-0010: spine as canonical type source (`IntegrityDigest`, `AddressedDigest` land in `_spine/core.d.ts` first)
- TanStack security advisory GHSA-g7cv-rxg3-hmpx (the catalyst, not the justification)
