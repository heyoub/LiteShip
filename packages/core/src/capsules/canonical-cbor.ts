/**
 * Capsule declaration wrapping CanonicalCbor as a `pureTransform`. Anchors
 * the content-address kernel inside the 7-arm factory so the harness can
 * audit the encoder alongside boundary evaluation and token buffering.
 *
 * @module
 */

import { Schema } from 'effect';
import { defineCapsule } from '../assembly.js';
import { CanonicalCbor } from '../cbor.js';

/**
 * Declared capsule for `CanonicalCbor.encode`. Registered in the module-level
 * catalog at import time; walked by the factory compiler.
 */
export const canonicalCborCapsule = defineCapsule({
  _kind: 'pureTransform',
  name: 'core.canonical-cbor',
  input: Schema.Unknown,
  output: Schema.instanceOf(Uint8Array),
  capabilities: { reads: [], writes: [] },
  invariants: [
    {
      name: 'output-is-uint8array',
      check: (_input: unknown, output: Uint8Array): boolean => output instanceof Uint8Array,
      message: 'encoder output must be Uint8Array',
    },
    {
      name: 'key-order-stable',
      check: (input: unknown, output: Uint8Array): boolean => {
        // For plain objects, re-encoding a key-permuted shallow copy must
        // produce identical bytes. Cheap structural check that binds the
        // capsule's intent (canonical key order) to its observable output.
        if (input === null || typeof input !== 'object' || Array.isArray(input) || input instanceof Uint8Array) {
          return true;
        }
        const keys = Object.keys(input as Record<string, unknown>);
        if (keys.length < 2) return true;
        const reversed: Record<string, unknown> = {};
        for (const k of [...keys].reverse()) {
          reversed[k] = (input as Record<string, unknown>)[k];
        }
        const reencoded = CanonicalCbor.encode(reversed);
        if (reencoded.length !== output.length) return false;
        for (let i = 0; i < output.length; i++) {
          if (reencoded[i] !== output[i]) return false;
        }
        return true;
      },
      message: 'encoded output must be invariant under key permutation',
    },
  ],
  budgets: { p95Ms: 1, allocClass: 'bounded' },
  site: ['node', 'browser', 'worker', 'edge'],
  run: (input: unknown): Uint8Array => CanonicalCbor.encode(input),
});
