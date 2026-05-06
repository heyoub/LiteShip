/**
 * Test-only entrypoint for `@czap/assets`. Imported as `@czap/assets/testing`.
 *
 * `resetAssetRegistry` mutates global registry state and is a footgun in
 * production code paths. It is intentionally partitioned off the main
 * package entry so a consumer cannot reach it by importing `@czap/assets`
 * directly.
 *
 * @module
 */

export { resetAssetRegistry } from './contract.js';
