/**
 * Production CLI subprocess re-exports.
 *
 * The canonical implementation lives at ./lib/spawn.ts so it's part of the
 * cli's tsc --build (rootDir) tree. scripts/lib/spawn.ts is a thin shim
 * pointing at the same file so existing test/script imports keep working.
 *
 * @module
 */

export { spawnArgv, spawnArgvCapture, quoteWindowsArg } from './lib/spawn.js';
export type { SpawnArgvOpts, SpawnResult, SpawnCaptureOpts, SpawnCaptureResult } from './lib/spawn.js';
