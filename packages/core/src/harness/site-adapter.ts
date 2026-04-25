/**
 * Harness template for the `siteAdapter` assembly arm.
 *
 * Site adapters convert between native host objects and czap representations.
 * Without typed `toCzap` / `fromCzap` channels on the capsule contract the
 * harness can't drive round-trip equality, so each case is emitted as
 * `it.skip` rather than a vacuous placeholder.
 *
 * @module
 */

import type { CapsuleDef } from '../assembly.js';
import type { HarnessOutput } from './pure-transform.js';

/**
 * Generate the test + bench file contents for a `siteAdapter` capsule.
 * Emits `it.skip` placeholders for round-trip and host-capability tests.
 */
export function generateSiteAdapter(
  cap: CapsuleDef<'siteAdapter', unknown, unknown, unknown>,
): HarnessOutput {
  const testFile = `// GENERATED — do not edit by hand
import { describe, it } from 'vitest';

describe('${cap.name}', () => {
  it.skip('round-trip equality: native -> czap -> native preserves structure', () => {
    // TODO(harness): needs cap.toCzap / cap.fromCzap on the contract.
  });

  it.skip('host capability matrix: each declared site supports the adapter', () => {
    // TODO(harness): needs per-site dispatcher to invoke under each runtime.
  });
});
`;

  const benchFile = `// GENERATED — do not edit by hand
import { bench } from 'vitest';

bench('${cap.name}', () => {
  // adapter call with a canonical native fixture
}, { time: 500 });
`;

  return { testFile, benchFile };
}
