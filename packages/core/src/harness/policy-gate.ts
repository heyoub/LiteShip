/**
 * Harness template for the `policyGate` assembly arm.
 *
 * Policy gates resolve allow/deny against typed subjects. Without a
 * `decide(subject)` channel on the capsule contract the harness can't
 * exercise allow/deny branches or check reason chains, so each case is
 * emitted as `it.skip` rather than a vacuous placeholder.
 *
 * @module
 */

import type { CapsuleDef } from '../assembly.js';
import type { HarnessOutput } from './pure-transform.js';

/**
 * Generate the test + bench file contents for a `policyGate` capsule.
 * Emits `it.skip` placeholders for allow / deny / reason-chain coverage.
 */
export function generatePolicyGate(
  cap: CapsuleDef<'policyGate', unknown, unknown, unknown>,
): HarnessOutput {
  const testFile = `// GENERATED — do not edit by hand
import { describe, it } from 'vitest';

describe('${cap.name}', () => {
  it.skip('allow branch: a subject meeting the policy resolves to allow', () => {
    // TODO(harness): needs cap.decide handler to drive subject -> outcome.
  });

  it.skip('deny branch: a subject failing the policy resolves to deny', () => {
    // TODO(harness): same — needs cap.decide.
  });

  it.skip('reason chain present on every decision', () => {
    // TODO(harness): same — needs cap.decide and a typed reasons schema.
  });

  it.skip('no silent deny: every deny has a typed reason code', () => {
    // TODO(harness): same — needs reasons enum on the contract.
  });
});
`;

  const benchFile = `// GENERATED — do not edit by hand
import { bench } from 'vitest';

bench('${cap.name}', () => {
  // policy decision with a canonical fixture
}, { time: 500 });
`;

  return { testFile, benchFile };
}
