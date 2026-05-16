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
import { color, colorEnabled, header } from '../packages/cli/src/lib/ansi.js';

const repoRoot = resolve(import.meta.dirname, '..');

function main(): void {
  // Don't decorate CI logs.
  if (process.env.CI || process.env.CZAP_QUIET_INSTALL) return;

  // Detect first-time vs repeat install. Repeat installs already have at
  // least one package's dist/ on disk; first-time has none.
  const corePackaged = existsSync(resolve(repoRoot, 'packages/core/dist/index.js'));
  const cliPackaged = existsSync(resolve(repoRoot, 'packages/cli/dist/index.js'));
  const firstTime = !corePackaged && !cliPackaged;
  const on = colorEnabled(process.stdout);

  const lines: string[] = [];
  lines.push('');
  lines.push(`  ${header('LiteShip', on)} — moored.`);
  if (firstTime) {
    lines.push('');
    lines.push('  First time aboard? One command runs the whole shakedown:');
    lines.push('');
    lines.push(`    ${color('cyan', 'pnpm setup', on)}           ${color('dim', '# rig-check + build + test', on)}`);
    lines.push('');
    lines.push('  Or step through it yourself:');
    lines.push('');
    lines.push(`    ${color('cyan', 'pnpm run doctor', on)}      ${color('dim', '# preflight rig-check only', on)}`);
    lines.push(`    ${color('cyan', 'pnpm run build', on)}       ${color('dim', '# lay the keel (tsc across 14 packages)', on)}`);
    lines.push(`    ${color('cyan', 'pnpm test', on)}            ${color('dim', '# fast inner loop (~75s)', on)}`);
    lines.push('');
    lines.push('  Bearings & sugar:');
    lines.push(`    ${color('cyan', 'pnpm scripts', on)}         ${color('dim', '# categorized catalog of all dev scripts', on)}`);
    lines.push(`    ${color('cyan', 'pnpm run glossary', on)}    ${color('dim', '# look up a LiteShip / CZAP term', on)}`);
  } else {
    lines.push('');
    lines.push('  Cast off with:');
    lines.push(
      `    ${color('cyan', 'pnpm run build', on)}   ${color('cyan', 'pnpm test', on)}   ${color('cyan', 'pnpm run doctor', on)}   ${color('cyan', 'pnpm scripts', on)}`,
    );
  }
  lines.push('');

  process.stdout.write(lines.join('\n'));
}

try {
  main();
} catch {
  // Never fail the install over a banner.
}
