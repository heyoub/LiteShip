/**
 * Assembly catalog — 7-arm closed vocabulary of capsule kinds.
 * `defineCapsule` validates a contract, computes its content address,
 * and registers it in the module-level catalog for the compiler to walk.
 *
 * @module
 */

import type { CapsuleContract, AssemblyKind } from './capsule.js';
import type { ContentAddress } from './brands.js';
import { fnv1aBytes } from './fnv.js';
import { CanonicalCbor } from './cbor.js';

/** A capsule declaration plus its content-addressed id. */
export interface CapsuleDef<K extends AssemblyKind, In, Out, R>
  extends CapsuleContract<K, In, Out, R> {
  readonly id: ContentAddress;
}

const catalog: CapsuleDef<AssemblyKind, unknown, unknown, unknown>[] = [];

function computeId(
  contract: Omit<CapsuleContract<AssemblyKind, unknown, unknown, unknown>, 'id'>,
): ContentAddress {
  // ADR-0003: route through CanonicalCbor to obtain a deterministic byte
  // sequence (RFC 8949 §4.2.1) before hashing. Stable across key order,
  // platform endianness, and stringification quirks.
  const canonicalBytes = CanonicalCbor.encode({
    kind: contract._kind,
    name: contract.name,
    site: contract.site,
    budgets: contract.budgets,
    capabilities: contract.capabilities,
    invariantNames: contract.invariants.map((i) => i.name),
  });
  return fnv1aBytes(canonicalBytes);
}

/**
 * Declare a capsule. Validates shape, computes content address,
 * registers in the module-level catalog, returns a typed def.
 * No runtime behavior beyond registration — behavior comes from
 * the harness/compiler walking the catalog.
 */
export function defineCapsule<K extends AssemblyKind, In, Out, R>(
  decl: Omit<CapsuleContract<K, In, Out, R>, 'id'>,
): CapsuleDef<K, In, Out, R> {
  // For pureTransform capsules: omitting `run` downgrades the generated
  // harness test to `it.skip` (Task 8 honest-skip discipline). Warn so
  // contributors notice rather than silently skip property tests.
  // Other arms don't yet have a wired runtime channel — see ADR-TODO.
  if (decl._kind === 'pureTransform' && decl.invariants.length > 0 && decl.run === undefined) {
    // eslint-disable-next-line no-console
    console.warn(
      `[defineCapsule] pureTransform capsule "${decl.name}" declares ${decl.invariants.length} ` +
        `invariant(s) but no \`run\` function — invariants are type-only without one. ` +
        `Add \`run: (input) => ...\` to enable runtime validation against your invariants.`,
    );
  }
  const id = computeId(decl as Omit<CapsuleContract<AssemblyKind, unknown, unknown, unknown>, 'id'>);
  const def = { ...decl, id } as CapsuleDef<K, In, Out, R>;
  catalog.push(def as CapsuleDef<AssemblyKind, unknown, unknown, unknown>);
  return def;
}

/** Read-only snapshot of all registered capsules. */
export function getCapsuleCatalog(): readonly CapsuleDef<AssemblyKind, unknown, unknown, unknown>[] {
  return catalog.slice();
}

/** Clear the registry. Intended for tests and hot-reload only. */
export function resetCapsuleCatalog(): void {
  catalog.length = 0;
}
