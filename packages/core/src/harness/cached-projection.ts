/**
 * Harness template for the `cachedProjection` assembly arm.
 *
 * Cached projections derive an output from a source via a deterministic
 * pipeline with cache invalidation tied to source content addresses.
 * Without a `derive(source)` channel on the contract the harness can't
 * exercise cache-hit equality or invalidation, so each case is emitted
 * as `it.skip` rather than a vacuous placeholder.
 *
 * @module
 */

import type { CapsuleDef } from '../assembly.js';
import type { HarnessOutput } from './pure-transform.js';

/**
 * Generate the test + bench file contents for a `cachedProjection` capsule.
 * Emits `it.skip` placeholders for cache-hit and invalidation tests.
 */
export function generateCachedProjection(
  cap: CapsuleDef<'cachedProjection', unknown, unknown, unknown>,
): HarnessOutput {
  const testFile = `// GENERATED — do not edit by hand
import { describe, it } from 'vitest';

describe('${cap.name}', () => {
  it.skip('cache hit: identical source yields the same derived output', () => {
    // TODO(harness): needs cap.derive handler + content-addressed source.
  });

  it.skip('invalidation: source change produces new cache entry', () => {
    // TODO(harness): same — needs cap.derive.
  });
});
`;

  const benchFile = `// GENERATED — do not edit by hand
import { bench } from 'vitest';

bench('${cap.name} — decode throughput', () => {
  // decode a canonical source, measure p95 vs budget (${cap.budgets.p95Ms ?? 'n/a'}ms)
}, { time: 500 });
`;

  return { testFile, benchFile };
}
