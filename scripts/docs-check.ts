#!/usr/bin/env tsx
/**
 * Regenerates docs/api/ to a temp directory and diffs it against the committed
 * docs/api/. Fails non-zero if they differ — prevents committed API docs from
 * silently drifting away from source TSDoc.
 *
 * Run this in CI after every gauntlet pass. Run `pnpm run docs:build` locally
 * when TSDoc blocks change to refresh the committed output.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const COMMITTED_DIR = 'docs/api';
const DOCS_NODE_OPTIONS = ['--max-old-space-size=4096', process.env.NODE_OPTIONS ?? ''].join(' ').trim();

if (!existsSync(COMMITTED_DIR)) {
  console.error(`docs:check — ${COMMITTED_DIR} does not exist. Run 'pnpm run docs:build' first.`);
  process.exit(1);
}

const tempDir = mkdtempSync(join(tmpdir(), 'czap-docs-check-'));

try {
  const build = spawnSync('pnpm', ['exec', 'typedoc', '--out', tempDir], {
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      NODE_OPTIONS: DOCS_NODE_OPTIONS,
    },
  });
  if (build.status !== 0) {
    console.error('docs:check — typedoc build failed');
    process.exit(1);
  }

  const diff = spawnSync('git', ['diff', '--no-index', '--stat', COMMITTED_DIR, tempDir], {
    stdio: 'pipe',
    shell: true,
  });
  const diffOutput = (diff.stdout?.toString() ?? '') + (diff.stderr?.toString() ?? '');

  if (diff.status !== 0 || diffOutput.trim().length > 0) {
    console.error(`docs:check — committed ${COMMITTED_DIR}/ is out of sync with source TSDoc:`);
    console.error(diffOutput);
    console.error(`Run 'pnpm run docs:build' and commit the result.`);
    process.exit(1);
  }

  console.log(`docs:check passed — committed ${COMMITTED_DIR}/ matches source TSDoc.`);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
