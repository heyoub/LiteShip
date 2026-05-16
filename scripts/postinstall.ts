/**
 * Friendly post-install banner. Runs after every `pnpm install` and tells
 * the next-step story: doctor, build, test. Silent when CI=1 so log
 * scrapers stay clean. Never fails the install — wraps everything in a
 * single try/catch and exits 0 on any error.
 *
 * @module
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..');

function main(): void {
  // Don't decorate CI logs.
  if (process.env.CI || process.env.CZAP_QUIET_INSTALL) return;

  // Detect first-time vs repeat install. Repeat installs already have at
  // least one package's dist/ on disk; first-time has none.
  const corePackaged = existsSync(resolve(repoRoot, 'packages/core/dist/index.js'));
  const cliPackaged = existsSync(resolve(repoRoot, 'packages/cli/dist/index.js'));
  const firstTime = !corePackaged && !cliPackaged;

  const lines: string[] = [];
  lines.push('');
  lines.push('  LiteShip — install complete.');
  if (firstTime) {
    lines.push('');
    lines.push('  First time here? One command runs the whole shake-down:');
    lines.push('');
    lines.push('    pnpm setup           # rig-check + build + test');
    lines.push('');
    lines.push('  Or step through it yourself:');
    lines.push('');
    lines.push('    pnpm run doctor      # preflight rig-check only');
    lines.push('    pnpm run build       # tsc across 14 packages');
    lines.push('    pnpm test            # fast inner loop (~75s)');
    lines.push('');
    lines.push('  More:');
    lines.push('    pnpm scripts         # categorized catalog of all dev scripts');
    lines.push('    pnpm run glossary    # look up a LiteShip / CZAP term');
  } else {
    lines.push('');
    lines.push('  Common next steps:');
    lines.push('    pnpm run build       pnpm test       pnpm run doctor       pnpm scripts');
  }
  lines.push('');

  process.stdout.write(lines.join('\n'));
}

try {
  main();
} catch {
  // Never fail the install over a banner.
}
