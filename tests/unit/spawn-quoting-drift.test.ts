/**
 * Drift guard — asserts the three exposed `quoteWindowsArg` references all
 * point to the same canonical implementation in scripts/lib/spawn.ts. The
 * function is re-exported by:
 *
 *   - packages/cli/src/spawn-helpers.ts  (production CLI)
 *   - scripts/support/pnpm-process.ts    (gauntlet/scripts)
 *
 * Identity equality (===) is the strongest possible assertion: anyone who
 * forks the implementation will trip this test immediately.
 *
 * @module
 */

import { describe, it, expect } from 'vitest';
import { quoteWindowsArg as quoteFromCanonical } from '../../scripts/lib/spawn.js';
import { quoteWindowsArg as quoteFromCli } from '../../packages/cli/src/spawn-helpers.js';
import { quoteWindowsArg as quoteFromScripts } from '../../scripts/support/pnpm-process.js';

const VECTORS: readonly string[] = [
  '',
  'plain',
  'with space',
  'with"quote',
  'path/with/slashes.ts',
  'C:\\Users\\<username>\\.projects\\czap',
  'metachar-semi;echo pwned',
  'pipe|tricks',
  'amp&amp',
  'redir<in',
  'redir>out',
  'paren()group',
  'caret^escape',
  'mixed "and" special; chars',
  "tests/__nonexistent__; echo should-not-execute",
];

describe('quoteWindowsArg drift guard', () => {
  it('cli re-export points to canonical implementation', () => {
    expect(quoteFromCli).toBe(quoteFromCanonical);
  });

  it('scripts re-export points to canonical implementation', () => {
    expect(quoteFromScripts).toBe(quoteFromCanonical);
  });

  for (const input of VECTORS) {
    it(`canonical produces stable output for ${JSON.stringify(input)}`, () => {
      const out = quoteFromCanonical(input);
      // Output must be a string (i.e. function actually ran).
      expect(typeof out).toBe('string');
      // Three references agree (defensive — if either toBe(canonical) above passes,
      // this is automatic, but vector behavior changes are still useful diff signal).
      expect(quoteFromCli(input)).toBe(out);
      expect(quoteFromScripts(input)).toBe(out);
    });
  }
});
