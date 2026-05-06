/**
 * Test-only entrypoint for `@czap/core`. Imported as `@czap/core/testing`.
 *
 * These helpers mutate global registry state and would be footguns in
 * production code paths (an edge worker warm-start that calls
 * `resetCapsuleCatalog` would silently wipe every registered capsule,
 * causing dispatch to fail intermittently). They are intentionally
 * partitioned off the main package entry so a consumer cannot reach
 * them by importing `@czap/core` directly.
 *
 * @module
 */

export { resetCapsuleCatalog } from './assembly.js';
