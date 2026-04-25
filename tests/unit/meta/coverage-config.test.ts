/**
 * Drift guard — asserts coverage gate config has not been silently
 * lowered. Tracks two structural invariants from the subprocess-coverage
 * spec (docs/superpowers/specs/2026-04-25-subprocess-coverage-design.md):
 *
 *   1. vitest.shared.ts coverageExclude length unchanged.
 *   2. scripts/merge-coverage.ts PACKAGE_THRESHOLD_OVERRIDES exact values.
 *
 * If the gate genuinely needs to change, update the expected values here
 * in the same commit — that surfaces the change in code review instead of
 * letting it slip through.
 *
 * @module
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { coverageExclude } from '../../../vitest.shared.js';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');

describe('coverage config drift guard', () => {
  it('coverageExclude has expected size (no silent additions)', () => {
    // 11 baseline + 6 subprocess-only bootstrap modules added in Task 19:
    // bin.ts, http-server.ts, stdio-server.ts, processor.ts, processor-bootstrap.ts,
    // dev/player.ts. Each replaces a c8 ignore that couldn't be honored across
    // the tsx → v8 → istanbul source-map merge chain.
    expect(coverageExclude).toHaveLength(17);
  });

  it('merge-coverage.ts PACKAGE_THRESHOLD_OVERRIDES are pinned', () => {
    const src = readFileSync(resolve(REPO_ROOT, 'scripts', 'merge-coverage.ts'), 'utf8');
    const block = src.match(
      /const PACKAGE_THRESHOLD_OVERRIDES[\s\S]*?\};/,
    )?.[0];
    expect(block).toBeDefined();
    expect(block).toContain("core: {");
    expect(block).toContain("functions: 97");
    expect(block).toContain("web: {");
    // Ensure both core and web functions: 97 overrides are present.
    const ninetySevenCount = (block!.match(/functions: 97/g) ?? []).length;
    expect(ninetySevenCount).toBe(2);
  });

  it('merge-coverage.ts TOTAL_THRESHOLDS are pinned', () => {
    const src = readFileSync(resolve(REPO_ROOT, 'scripts', 'merge-coverage.ts'), 'utf8');
    expect(src).toMatch(/const TOTAL_THRESHOLDS[\s\S]*?lines: 90/);
    expect(src).toMatch(/const TOTAL_THRESHOLDS[\s\S]*?statements: 90/);
    expect(src).toMatch(/const TOTAL_THRESHOLDS[\s\S]*?functions: 90/);
    expect(src).toMatch(/const TOTAL_THRESHOLDS[\s\S]*?branches: 80/);
  });

  it('merge-coverage.ts PACKAGE_THRESHOLDS are pinned', () => {
    const src = readFileSync(resolve(REPO_ROOT, 'scripts', 'merge-coverage.ts'), 'utf8');
    expect(src).toMatch(/const PACKAGE_THRESHOLDS[\s\S]*?lines: 85/);
    expect(src).toMatch(/const PACKAGE_THRESHOLDS[\s\S]*?statements: 85/);
    expect(src).toMatch(/const PACKAGE_THRESHOLDS[\s\S]*?functions: 85/);
    expect(src).toMatch(/const PACKAGE_THRESHOLDS[\s\S]*?branches: 75/);
  });
});
