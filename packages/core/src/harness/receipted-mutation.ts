/**
 * Harness template for the `receiptedMutation` assembly arm.
 *
 * Receipted mutations have side effects, so the harness can't drive them
 * with random inputs and assert generic invariants. Each test case is
 * emitted as `it.skip` with a TODO until the arm acquires a typed
 * runtime invocation channel.
 *
 * Per memory: "no vanity tests" — emitting a `() => true` placeholder
 * pretending to verify behavior is worse than skipping honestly.
 *
 * @module
 */

import type { CapsuleDef } from '../assembly.js';
import type { HarnessOutput } from './pure-transform.js';

/**
 * Generate the test + bench file contents for a `receiptedMutation` capsule.
 * Emits `it.skip` placeholders covering contract shape, idempotency, audit
 * receipt, and fault reachability — each carries a TODO naming the
 * invocation channel it would need.
 */
export function generateReceiptedMutation(
  cap: CapsuleDef<'receiptedMutation', unknown, unknown, unknown>,
): HarnessOutput {
  const testFile = `// GENERATED — do not edit by hand
import { describe, it } from 'vitest';

describe('${cap.name}', () => {
  it.skip('contract shape: input and output decode/encode round-trip', () => {
    // TODO(harness): wire schema round-trip via cap.input / cap.output.
  });

  it.skip('is idempotent: two identical inputs produce equivalent receipts', () => {
    // TODO(harness): receipted mutations need a runtime channel to invoke
    // — until cap exposes a typed mutate handler, skip rather than fake.
  });

  it.skip('emits audit receipt with declared capabilities', () => {
    // TODO(harness): same — needs runtime channel to read emitted receipts.
  });

  it.skip('fault injection: declared faults are reachable', () => {
    // TODO(harness): faults table not yet on the capsule contract.
  });
});
`;

  const benchFile = `// GENERATED — do not edit by hand
import { bench } from 'vitest';

bench('${cap.name}', () => {
  // mutation invocation with a canonical fixture
}, { time: 500 });
`;

  return { testFile, benchFile };
}
