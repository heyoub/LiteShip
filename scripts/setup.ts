/**
 * Shake-down — first-run aggregate. Sequence:
 *   1. doctor (preflight rig-check)
 *   2. build (lay the keel)
 *   3. test (fast inner loop)
 *
 * Stops on the first failure. Each phase prints a banner so the human
 * watching the output can see which step they're in.
 *
 * @module
 */

import { color, colorEnabled, header } from '../packages/cli/src/lib/ansi.js';
import { spawnArgv } from './lib/spawn.js';

interface Phase {
  readonly name: string;
  readonly cmd: readonly string[];
  readonly hint?: string;
}

const PHASES: readonly Phase[] = [
  {
    name: 'rig-check',
    cmd: ['pnpm', 'run', 'doctor'],
    hint: 'Preflight signals -> bearings. `pnpm run doctor` to re-run in isolation.',
  },
  {
    name: 'lay the keel',
    cmd: ['pnpm', 'run', 'build'],
    hint: 'tsc --build across 14 packages.',
  },
  {
    name: 'shakedown trials',
    cmd: ['pnpm', 'test'],
    hint: 'Fast inner loop — unit + component + property + integration (~75s).',
  },
];

let failed = 0;
const start = Date.now();
const on = colorEnabled();

for (const phase of PHASES) {
  process.stderr.write(`\n${header(`-- shakedown: ${phase.name} --`, on)}\n`);
  if (phase.hint) process.stderr.write(`    ${color('dim', phase.hint, on)}\n`);
  const r = await spawnArgv(phase.cmd[0]!, phase.cmd.slice(1), { stdio: 'inherit' });
  if (r.exitCode !== 0) {
    process.stderr.write(
      `\n${color('red', `Shakedown aborted at ${phase.name}`, on)} (exit ${r.exitCode}).\n`,
    );
    process.stderr.write(`Re-run with: ${color('cyan', phase.cmd.join(' '), on)}\n`);
    failed = r.exitCode;
    break;
  }
}

const elapsedSec = Math.round((Date.now() - start) / 1000);

if (failed === 0) {
  process.stderr.write(
    `\n${color('green', 'Hull is shaken down — ready to sail.', on)} ${color('dim', `(${elapsedSec}s)`, on)}\n`,
  );
  process.exit(0);
} else {
  process.exit(failed);
}
