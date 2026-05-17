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
    // + 2 unmeasurable-by-construction modules: scene/src/contract.ts (pure
    // type declarations, erased by TS — 0/0/0/0 in the report) and
    // cli/src/spawn-helpers.ts (re-export shim — `export {...} from './lib
    // /spawn.js'` has no executable statements for v8 to track even though
    // the targets are exercised via vitest-runner + spawn-quoting-drift).
    // + 2 subprocess-style command modules added with ADR-0011 ShipCapsule:
    // cli/src/commands/ship.ts (orchestrates git + pnpm pack + pnpm publish
    // --dry-run + pnpm publish; integration-tested via the czap ship
    // --dry-run path that runs in every package:smoke gauntlet phase) and
    // cli/src/render-backend/ffmpeg.ts (spawns ffmpeg; skip-when-unavailable
    // smoke test makes this structurally 0% on machines without ffmpeg).
    expect(coverageExclude).toHaveLength(21);
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
    // The v0.1.0 cli override (lines/statements: 75, functions: 78,
    // branches: 60) was retired in ROADMAP Epic #4 once the cli
    // aggregate cleared package defaults (85/85/85/75). The lint
    // below asserts cli no longer appears in the override block —
    // future regressions surface in this drift guard before they
    // ship instead of being silently masked.
    expect(block).not.toContain("cli: {");
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
