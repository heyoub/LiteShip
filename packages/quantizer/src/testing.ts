/**
 * Test-only entrypoint for `@czap/quantizer`. Imported as
 * `@czap/quantizer/testing`.
 *
 * `MemoCache` and `TIER_TARGETS` are implementation primitives that
 * power the public `Q.from()` builder internally. Consumers don't need
 * direct access; tests do (for content-address cache assertions and
 * tier-gating verification). Partitioning them off the main entry keeps
 * the public surface focused on the builder.
 *
 * @module
 */

export { MemoCache } from './memo-cache.js';
export { TIER_TARGETS } from './quantizer.js';
