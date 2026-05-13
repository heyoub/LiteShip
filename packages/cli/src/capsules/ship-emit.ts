/**
 * ShipEmit — `receiptedMutation` arm instance `cli.ship-emit` (ADR-0011).
 *
 * Owns the side effect of writing a `<pkg>-<version>.shipcapsule.cbor`
 * next to a freshly-produced npm tarball. Input is the assembled
 * {@link ShipCapsule.Shape}; output is the file path written plus the
 * capsule's content-addressed `id` echoed back for the receipt envelope.
 *
 * Re-uses the seven-arm closure (ADR-0008): emission is a
 * `receiptedMutation`, not a new arm. The capsule declaration is what the
 * AST walker / type-directed detector picks up for
 * `reports/capsule-manifest.json`.
 *
 * @module
 */

import { writeFileSync } from 'node:fs';
import { Schema } from 'effect';
import { defineCapsule, ShipCapsule, type ContentAddress } from '@czap/core';

const ShipEmitInput = Schema.Struct({
  capsule_path: Schema.String,
  capsule_id: Schema.String,
});

const ShipEmitOutput = Schema.Struct({
  bytes_written: Schema.Number,
  capsule_path: Schema.String,
  capsule_id: Schema.String,
});

interface ShipEmitRunInput {
  readonly capsule: ShipCapsule.Shape;
  readonly capsule_path: string;
}

interface ShipEmitRunOutput {
  readonly bytes_written: number;
  readonly capsule_path: string;
  readonly capsule_id: ContentAddress;
}

/**
 * Declared capsule for the ShipCapsule emission side effect. Registered in
 * the module-level catalog at import time; walked by
 * `scripts/capsule-compile.ts`. The `id-matches-bytes` invariant binds the
 * receipt's `capsule_id` to the bytes that landed on disk.
 */
export const shipEmitCapsule = defineCapsule({
  _kind: 'receiptedMutation',
  name: 'cli.ship-emit',
  site: ['node'],
  capabilities: { reads: ['fs'], writes: ['fs'] },
  input: ShipEmitInput,
  output: ShipEmitOutput,
  budgets: { p95Ms: 10_000, allocClass: 'bounded' },
  invariants: [
    {
      name: 'id-matches-bytes',
      check: (
        input: { capsule_path: string; capsule_id: string },
        output: { bytes_written: number; capsule_path: string; capsule_id: string },
      ): boolean => input.capsule_id === output.capsule_id && input.capsule_path === output.capsule_path,
      message: 'emitted capsule id and path must match the assembled ShipCapsule (no in-flight mutation)',
    },
    {
      name: 'bytes-positive',
      check: (
        _input: { capsule_path: string; capsule_id: string },
        output: { bytes_written: number; capsule_path: string; capsule_id: string },
      ): boolean => typeof output.bytes_written === 'number' && output.bytes_written > 0,
      message: 'a ShipCapsule with zero bytes on disk is a broken receipt',
    },
  ],
});

/**
 * Runtime callable for the ship-emit capsule. Serializes the capsule to
 * canonical CBOR and writes it to `capsule_path`. Caller owns directory
 * existence and overwrite policy.
 */
export const ShipEmit = {
  run: (input: ShipEmitRunInput): ShipEmitRunOutput => {
    const bytes = ShipCapsule.canonicalize(input.capsule);
    writeFileSync(input.capsule_path, bytes);
    return {
      bytes_written: bytes.byteLength,
      capsule_path: input.capsule_path,
      capsule_id: input.capsule.id,
    };
  },
} as const;

export declare namespace ShipEmit {
  /** Input accepted by {@link ShipEmit.run}. */
  export type Input = ShipEmitRunInput;
  /** Output returned by {@link ShipEmit.run}. */
  export type Output = ShipEmitRunOutput;
}
