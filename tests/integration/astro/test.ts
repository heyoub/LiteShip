/**
 * Integration test for @czap/astro.
 *
 * Validates that the Astro integration bootstraps correctly by:
 *   1. Building the workspace packages (so dist/ exports resolve)
 *   2. Running `astro build` on a minimal Astro project that uses integration()
 *   3. Verifying the build exits cleanly and output files exist
 *   4. Verifying the detect script was injected into the HTML output
 *
 * Run: pnpm exec tsx tests/integration/astro/test.ts
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { runPnpm } from '../../../scripts/support/pnpm-process.ts';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const FIXTURE_DIR = resolve(import.meta.dirname);
const DIST_DIR = resolve(FIXTURE_DIR, 'dist');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`  PASS: ${message}`);
}

function findFiles(dir: string, ext: string): string[] {
  const results: string[] = [];
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFiles(fullPath, ext));
    } else if (entry.name.endsWith(ext)) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Search for a string across all files of a given extension in a directory.
 */
function anyFileContains(dir: string, ext: string, needle: string): boolean {
  for (const file of findFiles(dir, ext)) {
    if (readFileSync(file, 'utf-8').includes(needle)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('\n=== @czap/astro integration test ===\n');

  // Step 1 -- Build workspace packages so dist/ exports resolve
  console.log('[1/3] Building workspace packages...');
  const build = await runPnpm(['run', 'build'], {
    cwd: REPO_ROOT,
    env: { FORCE_COLOR: '0' },
  });
  if (build.code !== 0) {
    console.error('Workspace build failed:');
    console.error(build.stderr || build.stdout);
    process.exit(1);
  }
  console.log('  Workspace packages built.\n');

  // Step 2 -- Run astro build
  console.log('[2/3] Running astro build...');
  const astroBuild = await runPnpm(['exec', 'astro', 'build'], {
    cwd: FIXTURE_DIR,
    env: { FORCE_COLOR: '0' },
  });

  if (astroBuild.code !== 0) {
    console.error('astro build failed (exit code ' + astroBuild.code + '):');
    console.error(astroBuild.stderr || astroBuild.stdout);
    process.exit(1);
  }
  console.log('  astro build exited with code 0.\n');

  // Step 3 -- Verify output
  console.log('[3/3] Verifying build output...');

  assert(existsSync(DIST_DIR), 'dist/ directory exists');

  const htmlFiles = findFiles(DIST_DIR, '.html');
  assert(htmlFiles.length > 0, `HTML files emitted (found ${htmlFiles.length})`);

  // Verify the detect script was injected
  const indexHtml = htmlFiles.find((f) => f.endsWith('index.html'));
  assert(indexHtml !== undefined, 'index.html found in output');

  const html = readFileSync(indexHtml!, 'utf-8');
  assert(html.includes('__CZAP_DETECT__'), 'detect script injected (contains __CZAP_DETECT__)');
  assert(html.includes('data-czap-boundary'), 'satellite boundary element preserved');
  assert(html.includes('czap integration test'), 'page content rendered');

  // Verify the view-transition reinit script was injected.
  // Astro may place `injectScript('page', ...)` in an external JS bundle rather
  // than inline in HTML, so we check both HTML and JS assets.
  const reinitInHtml = html.includes('czap:reinit');
  const reinitInJs = anyFileContains(DIST_DIR, '.js', 'czap:reinit');
  assert(reinitInHtml || reinitInJs, 'view-transition reinit script emitted (czap:reinit in HTML or JS)');

  console.log('\n=== ALL CHECKS PASSED ===\n');
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
