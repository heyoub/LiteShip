/**
 * WASM binary resolution -- locates the czap-compute .wasm file.
 *
 * Searches for the compiled WASM binary in conventional locations:
 * 1. Configured path (if provided)
 * 2. crates/czap-compute/target/wasm32-unknown-unknown/release/czap_compute.wasm
 * 3. public/czap-compute.wasm (pre-copied)
 *
 * @module
 */

import { fileExists } from './resolve-fs.js';
import * as path from 'node:path';

/**
 * Successful WASM-resolution result: the absolute binary path plus the
 * search step that found it (useful for diagnostics).
 */
export interface WASMResolution {
  /** Absolute filesystem path to the WASM binary. */
  readonly filePath: string;
  /** Which search step matched (`'config'`, `'crate'`, or `'public'`). */
  readonly source: 'config' | 'crate' | 'public';
}

/**
 * Resolve the czap-compute WASM binary path.
 */
export function resolveWASM(projectRoot: string, configPath?: string): WASMResolution | null {
  // 1. Configured path
  if (configPath) {
    const resolved = path.isAbsolute(configPath) ? configPath : path.join(projectRoot, configPath);
    if (fileExists(resolved, 'czap/vite.wasm-resolve')) {
      return { filePath: resolved, source: 'config' };
    }
  }

  // 2. Rust crate build output
  const crateOutput = path.join(
    projectRoot,
    'crates/czap-compute/target/wasm32-unknown-unknown/release/czap_compute.wasm',
  );
  if (fileExists(crateOutput, 'czap/vite.wasm-resolve')) {
    return { filePath: crateOutput, source: 'crate' };
  }

  // 3. Public directory (pre-copied)
  const publicPath = path.join(projectRoot, 'public/czap-compute.wasm');
  if (fileExists(publicPath, 'czap/vite.wasm-resolve')) {
    return { filePath: publicPath, source: 'public' };
  }

  return null;
}
