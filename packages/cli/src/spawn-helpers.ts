/**
 * Production CLI subprocess re-exports.
 *
 * The implementation lives at scripts/lib/spawn.ts to give every spawn site
 * in the codebase (cli, scripts, tests) a single canonical owner. This file
 * re-exports the production-relevant surface so existing imports stay
 * unchanged.
 *
 * @module
 */

export { spawnArgv, quoteWindowsArg } from '../../../scripts/lib/spawn.js';
export type { SpawnArgvOpts, SpawnResult } from '../../../scripts/lib/spawn.js';
