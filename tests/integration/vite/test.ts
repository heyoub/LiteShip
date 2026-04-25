/**
 * Integration test for @czap/vite plugin.
 *
 * Validates that the Vite plugin bootstraps correctly by:
 *   1. Building the workspace packages (so dist/ exports resolve)
 *   2. Running `vite build` on a minimal project that uses plugin()
 *   3. Verifying the build exits cleanly and output files exist
 *   4. Verifying the JS bundle contains czap content
 *
 * Run: pnpm exec tsx tests/integration/vite/test.ts
 */

import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
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

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('\n=== @czap/vite integration test ===\n');

  // Clean previous dist
  if (existsSync(DIST_DIR)) {
    rmSync(DIST_DIR, { recursive: true, force: true });
  }

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

  // Step 2 -- Run vite build
  console.log('[2/3] Running vite build...');
  const viteBuild = await runPnpm(['exec', 'vite', 'build'], {
    cwd: FIXTURE_DIR,
    env: { FORCE_COLOR: '0' },
  });

  if (viteBuild.code !== 0) {
    console.error('vite build failed (exit code ' + viteBuild.code + '):');
    console.error(viteBuild.stderr || viteBuild.stdout);
    process.exit(1);
  }
  console.log('  vite build exited with code 0.\n');

  // Step 3 -- Verify output
  console.log('[3/3] Verifying build output...');

  assert(existsSync(DIST_DIR), 'dist/ directory exists');

  const indexHtml = join(DIST_DIR, 'index.html');
  assert(existsSync(indexHtml), 'dist/index.html exists');

  const html = readFileSync(indexHtml, 'utf-8');
  assert(html.includes('<script'), 'index.html contains script tag');

  const assetsDir = join(DIST_DIR, 'assets');
  assert(existsSync(assetsDir), 'dist/assets/ directory exists');

  const jsFiles = readdirSync(assetsDir).filter((f) => f.endsWith('.js'));
  assert(jsFiles.length > 0, `JS assets emitted (found ${jsFiles.length})`);

  const cssFiles = readdirSync(assetsDir).filter((f) => f.endsWith('.css'));
  assert(cssFiles.length > 0, `CSS assets emitted (found ${cssFiles.length})`);

  // Verify the JS bundle contains czap boundary content
  const jsContent = readFileSync(join(assetsDir, jsFiles[0]!), 'utf-8');
  const hasCzapContent = jsContent.includes('czap-vite-test') || jsContent.includes('container-width');
  assert(hasCzapContent, 'JS bundle contains czap boundary content');

  console.log('\n=== ALL CHECKS PASSED ===\n');
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
