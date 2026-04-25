/**
 * Filesystem helpers for convention-based primitive resolution.
 *
 * Wraps `fs.statSync` / `fs.readdirSync` so missing files / directories
 * are reported as `false` / `[]` instead of exceptions, while unexpected
 * errors are routed through `Diagnostics.warn` and re-thrown.
 *
 * @module
 */
import { Diagnostics } from '@czap/core';
import * as fs from 'node:fs';
import * as path from 'node:path';

type FsError = NodeJS.ErrnoException;

function isMissingFilesystemError(error: unknown): error is FsError {
  /* v8 ignore next — Node's fs APIs always throw objects (Error subclasses); the
     non-object/null guards are defense-in-depth for a narrowed `unknown` and are
     unreachable in practice without a host patching the fs module to throw primitives. */
  if (typeof error !== 'object' || error === null || !('code' in error)) return false;
  const code = (error as FsError).code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

/**
 * Return `true` when `filePath` points at a regular file. Missing paths
 * return `false`; other filesystem errors are logged via
 * `Diagnostics.warn` and re-thrown.
 */
export function fileExists(filePath: string, source: string): boolean {
  let exists = false;
  let missing = false;
  try {
    exists = fs.statSync(filePath).isFile();
  } catch (error) {
    if (isMissingFilesystemError(error)) {
      missing = true;
    } else {
      Diagnostics.warn({
        source,
        code: 'filesystem-stat-failed',
        message: `Failed to stat "${filePath}" while resolving a convention module.`,
        cause: error,
      });
      throw error;
    }
  }

  return missing ? false : exists;
}

/**
 * List files in `dir` whose names end with `suffix` (e.g.
 * `.boundaries.ts`). Missing directories return `[]`; other errors are
 * logged and re-thrown.
 */
export function findConventionFiles(dir: string, suffix: string, source: string): readonly string[] {
  let entries: readonly string[] = [];
  let missing = false;
  try {
    entries = fs.readdirSync(dir, { encoding: 'utf8' });
  } catch (error) {
    if (isMissingFilesystemError(error)) {
      missing = true;
    } else {
      Diagnostics.warn({
        source,
        code: 'filesystem-readdir-failed',
        message: `Failed to read "${dir}" while resolving "${suffix}" convention modules.`,
        cause: error,
        detail: { suffix },
      });
      throw error;
    }
  }

  if (missing) {
    return [];
  }

  return entries.filter((entry: string) => entry.endsWith(suffix)).map((entry: string) => path.join(dir, entry));
}
