/**
 * Shared utilities for convention-based resolve modules.
 */

import { Diagnostics } from '@czap/core';
import { pathToFileURL } from 'node:url';

// ---------------------------------------------------------------------------
// Generic dynamic import helper
// ---------------------------------------------------------------------------

/**
 * Attempt to dynamically import a module and extract a named export
 * whose `_tag` matches `expectedTag`.
 *
 * @param modulePath - Absolute path to the module file.
 * @param exportName - The named export to look up.
 * @param expectedTag - The `_tag` value that identifies a valid export
 *   (e.g. `'BoundaryDef'`).
 * @param diagnosticSource - The source string used in `Diagnostics`
 *   warnings (e.g. `'czap/vite.boundary-resolve'`).
 * @param diagnosticNoun - Human-readable noun for the warning message
 *   (e.g. `'boundary'`).
 * @returns The matched export cast to `T`, or `undefined` if not found
 *   or tagged incorrectly.
 */
export async function tryImportNamed<T>(
  modulePath: string,
  exportName: string,
  expectedTag: string,
  diagnosticSource: string,
  diagnosticNoun: string,
): Promise<T | undefined> {
  let imported: Record<string, unknown> | null = null;
  try {
    imported = (await import(/* @vite-ignore */ pathToFileURL(modulePath).href)) as Record<string, unknown>;
  } catch (err) {
    Diagnostics.warn({
      source: diagnosticSource,
      code: 'import-failed',
      message: `Failed to import "${modulePath}" for ${diagnosticNoun} "${exportName}".`,
      cause: err,
    });
  }

  const exported = imported?.[exportName];
  if (exported && typeof exported === 'object' && '_tag' in exported && exported._tag === expectedTag) {
    // Runtime `_tag` guard validates the caller-specified shape; T is the caller's
    // type for the tag. This is the single containment cast at the import boundary.
    return exported as T;
  }

  return undefined;
}
