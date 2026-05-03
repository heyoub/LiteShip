/**
 * Re-export shim. The canonical spawn helper now lives in
 * @czap/cli (packages/cli/src/lib/spawn.ts) so it can be part of the
 * cli's tsc --build (rootDir) tree. This file preserves the existing
 * import path used by tests and other scripts.
 *
 * @module
 */

export {
  spawnArgv,
  quoteWindowsArg,
  withSpawned,
  startSpawnHandle,
} from '../../packages/cli/src/lib/spawn.js';
export type {
  SpawnArgvOpts,
  SpawnResult,
  SpawnHandle,
} from '../../packages/cli/src/lib/spawn.js';
