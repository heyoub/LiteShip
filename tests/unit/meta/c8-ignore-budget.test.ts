/**
 * Budget guard — caps `/* c8 ignore` annotations across the repo at 5.
 *
 * The subprocess-coverage spec allows narrow `c8 ignore` comments only on
 * genuinely unreachable defensive branches. Each must include a one-line
 * `// reason: ...` rationale. Bumping this budget requires explicit code
 * review — silent additions fail this test.
 *
 * @module
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import fg from 'fast-glob';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const C8_IGNORE_BUDGET = 5;

describe('c8 ignore budget', () => {
  it(`repo has at most ${C8_IGNORE_BUDGET} c8 ignore annotations`, () => {
    const files = fg.sync(
      ['packages/*/src/**/*.ts', 'scripts/**/*.ts'],
      { cwd: REPO_ROOT, absolute: true, onlyFiles: true },
    );
    const offenders: { file: string; count: number }[] = [];
    let total = 0;
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      const matches = src.match(/\/\*\s*c8\s+ignore/g);
      if (matches && matches.length > 0) {
        offenders.push({ file: file.replace(REPO_ROOT, ''), count: matches.length });
        total += matches.length;
      }
    }
    if (total > C8_IGNORE_BUDGET) {
      console.error('c8 ignore offenders:', offenders);
    }
    expect(total).toBeLessThanOrEqual(C8_IGNORE_BUDGET);
  });
});
