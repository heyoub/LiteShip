/**
 * gauntlet — thin wrapper over `pnpm run gauntlet:full`. In `--dry-run`
 * mode emits the canonical phase list without executing anything.
 *
 * @module
 */

import { spawnSync } from 'node:child_process';
import { emit, emitError } from '../receipts.js';

/** Canonical phase list mirroring scripts/gauntlet.ts. */
const PHASES = [
  'build',
  'capsule:compile',
  'typecheck',
  'lint',
  'docs:check',
  'invariants',
  'test',
  'test:vite',
  'test:astro',
  'test:tailwind',
  'test:e2e',
  'test:e2e:stress',
  'test:e2e:stream-stress',
  'test:flake',
  'test:redteam',
  'bench',
  'bench:gate',
  'bench:reality',
  'package:smoke',
  'coverage:node',
  'coverage:merge',
  'report:runtime-seams',
  'audit',
  'report:satellite-scan',
  'feedback:verify',
  'runtime:gate',
  'capsule:verify',
  'flex:verify',
] as const;

/** Execute the gauntlet command. */
export async function gauntlet(dryRun: boolean): Promise<number> {
  if (dryRun) {
    emit({
      status: 'ok',
      command: 'gauntlet',
      timestamp: new Date().toISOString(),
      phases: PHASES,
      dryRun: true,
    });
    return 0;
  }
  const start = Date.now();
  const r = spawnSync('pnpm', ['run', 'gauntlet:full'], { stdio: 'inherit', shell: true });
  const elapsedMs = Date.now() - start;
  if (r.status !== 0) {
    emitError('gauntlet', `gauntlet exited with status ${r.status ?? 'signal'}`);
    return r.status ?? 1;
  }
  emit({
    status: 'ok',
    command: 'gauntlet',
    timestamp: new Date().toISOString(),
    phases: PHASES,
    elapsedMs,
    dryRun: false,
  });
  return 0;
}
