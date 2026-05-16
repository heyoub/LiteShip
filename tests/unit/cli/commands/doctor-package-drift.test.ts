/**
 * Drift-guard: the package list the doctor's `--fix` invalidates
 * tsbuildinfo for must match the package list the build script actually
 * compiles. Because doctor now reads the list dynamically out of root
 * package.json's `build` script, this test pins that contract:
 *
 *   1. The build script string must still parse via /packages\/(\w+)/g.
 *   2. The parsed list must equal exactly the 14 published, compiled
 *      packages currently in `packages/` (excluding `_spine`, which is
 *      type-only and has no dist/).
 *
 * If a new package is added to the build, this test will catch it being
 * forgotten from the doctor's invalidation loop only indirectly — the
 * loop is now dynamic, so adding a package to the build script
 * auto-includes it. The test instead asserts that the dynamic extraction
 * itself stays sound (regex still matches, set of packages on disk
 * matches what the build emits).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '../../../..');

function extractBuiltPackages(buildScript: string): readonly string[] {
  return Array.from(buildScript.matchAll(/packages\/([\w-]+)/g)).map((m) => m[1]);
}

function listOnDiskPackages(): readonly string[] {
  const entries = readdirSync(resolve(REPO_ROOT, 'packages'));
  return entries.filter((name) => {
    const full = resolve(REPO_ROOT, 'packages', name);
    return statSync(full).isDirectory();
  });
}

describe('doctor package-list drift guard', () => {
  it('root package.json build script parses into a non-empty package list', () => {
    const pkg = JSON.parse(readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf8')) as {
      scripts: { build: string };
    };
    const built = extractBuiltPackages(pkg.scripts.build);
    expect(built.length).toBeGreaterThanOrEqual(14);
  });

  it('every directory under packages/ except _spine appears in the build script', () => {
    const pkg = JSON.parse(readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf8')) as {
      scripts: { build: string };
    };
    const built = new Set(extractBuiltPackages(pkg.scripts.build));
    const onDisk = listOnDiskPackages().filter((p) => p !== '_spine');

    const missing = onDisk.filter((p) => !built.has(p));
    expect(missing, `packages on disk but not in the build script: ${missing.join(', ')}`).toEqual([]);
  });

  it('every package in the build script exists on disk', () => {
    const pkg = JSON.parse(readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf8')) as {
      scripts: { build: string };
    };
    const built = extractBuiltPackages(pkg.scripts.build);
    const onDisk = new Set(listOnDiskPackages());

    const phantom = built.filter((p) => !onDisk.has(p));
    expect(phantom, `packages in build script with no directory: ${phantom.join(', ')}`).toEqual([]);
  });
});
