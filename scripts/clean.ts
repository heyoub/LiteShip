/**
 * Dry-dock — purge build/test artifacts so the next run starts from an
 * empty deck. Removes:
 *   - packages/<all>/dist
 *   - packages/<all>/*.tsbuildinfo
 *   - root tsconfig.tsbuildinfo
 *   - coverage/
 *   - reports/ (only generated artifacts, not docs/adr or other source)
 *   - .czap/generated/
 *   - benchmarks/raw/ (keep history.jsonl)
 *
 * Does not touch node_modules; use `pnpm install --frozen-lockfile` (or
 * delete node_modules manually) for that.
 *
 * @module
 */

import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..');

const removed: string[] = [];
const skipped: string[] = [];

function rmIfPresent(absPath: string): void {
  const rel = absPath.startsWith(repoRoot) ? absPath.slice(repoRoot.length + 1) : absPath;
  if (!existsSync(absPath)) {
    skipped.push(rel);
    return;
  }
  rmSync(absPath, { recursive: true, force: true });
  removed.push(rel);
}

function cleanPackages(): void {
  const packagesDir = resolve(repoRoot, 'packages');
  if (!existsSync(packagesDir)) return;
  for (const entry of readdirSync(packagesDir)) {
    const pkgDir = resolve(packagesDir, entry);
    if (!statSync(pkgDir).isDirectory()) continue;
    rmIfPresent(resolve(pkgDir, 'dist'));
    rmIfPresent(resolve(pkgDir, 'tsconfig.tsbuildinfo'));
  }
}

function cleanRoot(): void {
  rmIfPresent(resolve(repoRoot, 'tsconfig.tsbuildinfo'));
  rmIfPresent(resolve(repoRoot, 'tsconfig.scripts.tsbuildinfo'));
  rmIfPresent(resolve(repoRoot, 'tsconfig.tests.tsbuildinfo'));
  rmIfPresent(resolve(repoRoot, 'coverage'));
  rmIfPresent(resolve(repoRoot, '.czap/generated'));
  rmIfPresent(resolve(repoRoot, 'benchmarks/raw'));
}

cleanPackages();
cleanRoot();

const quiet = process.env.CZAP_QUIET_INSTALL || process.env.CI;
if (!quiet) {
  process.stderr.write(`czap clean: removed ${removed.length} artifact(s).\n`);
  for (const r of removed) process.stderr.write(`  - ${r}\n`);
  if (removed.length === 0) {
    process.stderr.write('  Deck was already clear.\n');
  }
}
