/**
 * Shake-down — first-run aggregate. Sequence:
 *   1. doctor (preflight rig-check)
 *   2. build (tsc across compiled packages)
 *   3. test (fast inner loop)
 *
 * Stops on the first failure. Each phase prints a banner so the human
 * watching the output can see which step they're in.
 *
 * @module
 */

import { spawnArgv } from './lib/spawn.js';

interface Phase {
  readonly name: string;
  readonly cmd: readonly string[];
  readonly hint?: string;
}

const PHASES: readonly Phase[] = [
  {
    name: 'doctor',
    cmd: ['pnpm', 'run', 'doctor'],
    hint: 'Preflight rig-check. Use `pnpm run doctor` to re-run in isolation.',
  },
  {
    name: 'build',
    cmd: ['pnpm', 'run', 'build'],
    hint: 'tsc --build across 14 packages.',
  },
  {
    name: 'test',
    cmd: ['pnpm', 'test'],
    hint: 'Fast inner loop — unit + component + property + integration (~75s).',
  },
];

let failed = 0;
const start = Date.now();

for (const phase of PHASES) {
  process.stderr.write(`\n==> czap setup: ${phase.name}\n`);
  if (phase.hint) process.stderr.write(`    ${phase.hint}\n`);
  const r = await spawnArgv(phase.cmd[0]!, phase.cmd.slice(1), { stdio: 'inherit' });
  if (r.exitCode !== 0) {
    process.stderr.write(`\nczap setup: ${phase.name} failed (exit ${r.exitCode}).\n`);
    process.stderr.write(`Re-run with: ${phase.cmd.join(' ')}\n`);
    failed = r.exitCode;
    break;
  }
}

const elapsedSec = Math.round((Date.now() - start) / 1000);

if (failed === 0) {
  process.stderr.write(
    `\nczap setup: all phases passed (${elapsedSec}s). Hull is shaken down — ready to sail.\n`,
  );
  process.exit(0);
} else {
  process.exit(failed);
}
