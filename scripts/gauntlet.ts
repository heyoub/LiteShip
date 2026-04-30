/**
 * Gauntlet orchestrator — runs the full gauntlet pipeline with browser coverage
 * executing in parallel alongside integration tests, e2e, benchmarks, etc.
 *
 * This avoids the ~81 min browser coverage bottleneck by overlapping it with
 * ~15 min of other serial work that doesn't depend on coverage results.
 *
 * Phases:
 *   1. Build + validate (serial)
 *   2. Unit tests (serial) — must pass before coverage makes sense
 *   3. Fork browser coverage in background (slow, runs concurrently)
 *   4. Integration, e2e, stress, flake, redteam, bench (serial, overlapping with 3)
 *   5. Node coverage (fast ~38s), wait for browser coverage, merge
 *   6. Reports + gates (serial)
 */

import { execSync, spawn } from 'node:child_process';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');

interface StepResult {
  command: string;
  durationMs: number;
}

interface RunOptions {
  /**
   * Once this regex matches the child's piped stdout, the work is considered
   * complete and a grace window opens for the child to exit on its own. If
   * the child doesn't close before `gracePeriodMs` elapses, we tree-kill it.
   * Used to defuse vitest browser's Chromium teardown hang on Windows: by the
   * time the v8 coverage report header prints, the data is already on disk,
   * so a watchdog reap after the marker is safe to treat as success.
   */
  doneMarker?: RegExp;
  gracePeriodMs?: number;
}

const stepResults: StepResult[] = [];

function killTree(pid: number): void {
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /T /F /PID ${pid}`, { stdio: 'ignore' });
    } else {
      execSync(`kill -9 -${pid}`, { stdio: 'ignore' });
    }
  } catch {
    // Already dead; nothing to do.
  }
}

function run(label: string, command: string, opts: RunOptions = {}): Promise<void> {
  const start = Date.now();
  const useDoneMarker = opts.doneMarker !== undefined;
  return new Promise((resolveStep, rejectStep) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`  ${label}`);
    console.log(`${'='.repeat(60)}\n`);

    const child = spawn(command, {
      shell: true,
      stdio: useDoneMarker ? ['inherit', 'pipe', 'inherit'] : 'inherit',
      cwd: ROOT,
      env: { ...process.env, FORCE_COLOR: '1' },
    });

    let watchdog: NodeJS.Timeout | undefined;
    let watchdogFired = false;
    let markerSeen = false;

    if (useDoneMarker && child.stdout) {
      child.stdout.on('data', (chunk: Buffer) => {
        process.stdout.write(chunk);
        if (!markerSeen && opts.doneMarker!.test(chunk.toString('utf8'))) {
          markerSeen = true;
          const grace = opts.gracePeriodMs ?? 60_000;
          watchdog = setTimeout(() => {
            watchdogFired = true;
            console.warn(
              `\n[gauntlet] "${label}" did not exit within ${grace}ms after the completion marker. ` +
                `Coverage data was already emitted to disk; tree-killing the child to unblock the next phase.`,
            );
            if (child.pid !== undefined) killTree(child.pid);
          }, grace);
        }
      });
    }

    child.on('close', (code) => {
      if (watchdog) clearTimeout(watchdog);
      const durationMs = Date.now() - start;
      stepResults.push({ command: label, durationMs });
      if (code === 0) {
        resolveStep();
      } else if (watchdogFired && markerSeen) {
        console.log(
          `[gauntlet] "${label}" reaped by watchdog after ${durationMs}ms; the completion marker fired before kill, so on-disk artifacts are valid — treating as success.`,
        );
        resolveStep();
      } else {
        rejectStep(new Error(`"${label}" failed with exit code ${code}`));
      }
    });

    child.on('error', (err) => {
      if (watchdog) clearTimeout(watchdog);
      rejectStep(new Error(`"${label}" spawn error: ${err.message}`));
    });
  });
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const min = Math.floor(ms / 60_000);
  const sec = Math.round((ms % 60_000) / 1000);
  return `${min}m${sec}s`;
}

async function main() {
  const gauntletStart = Date.now();

  try {
    // ── Phase 1: Build + validate ──────────────────────────────────────
    await run('build', 'pnpm run build');
    await run('capsule:compile', 'pnpm run capsule:compile');
    await run('typecheck', 'pnpm run typecheck');
    await run('lint', 'pnpm run lint');
    await run('docs:check', 'pnpm run docs:check');
    await run('invariants', 'pnpm exec tsx scripts/check-invariants.ts');

    // ── Phase 2: Unit tests ────────────────────────────────────────────
    await run('test (unit + component + property + integration)', 'pnpm test');

    // ── Phase 4: Integration, e2e, stress, bench ───────────────────────
    // Browser coverage USED to fork in the background here for wall-clock
    // savings, but on Windows under v8 coverage instrumentation that
    // parallelism caused catastrophic resource contention (port exhaustion
    // from concurrent Vite spawns, vitest worker crashes, native
    // STATUS_ACCESS_VIOLATIONs in subprocess pipelines). Browser coverage
    // now runs sequentially in Phase 5. ~30 min wall-clock cost; reliable.
    await run('test:vite', 'pnpm run test:vite');
    await run('test:astro', 'pnpm run test:astro');
    await run('test:tailwind', 'pnpm run test:tailwind');
    await run('test:e2e', 'pnpm run test:e2e');
    await run('test:e2e:stress', 'pnpm run test:e2e:stress');
    await run('test:e2e:stream-stress', 'pnpm run test:e2e:stream-stress');
    await run('test:flake', 'pnpm run test:flake');
    await run('test:redteam', 'pnpm run test:redteam');
    await run('bench', 'pnpm run bench');
    await run('bench:gate', 'pnpm run bench:gate');
    await run('bench:reality', 'pnpm run bench:reality');
    await run('package:smoke', 'pnpm run package:smoke');

    // ── Phase 5: Coverage (sequential) + merge ─────────────────────────
    // coverage:node:tracked sets NODE_V8_COVERAGE so spawn-helper subprocesses
    // emit raw v8 dumps into coverage/subprocess-raw. merge-subprocess-v8
    // then converts via v8-to-istanbul and unions into coverage/node/coverage-final.json
    // before merge-coverage.ts gates the merged report.
    await run('coverage:wipe-subprocess', 'rimraf coverage/subprocess-raw');
    await run('coverage:node:tracked', 'pnpm run coverage:node:tracked');
    // Vitest browser on Windows can hang during Chromium teardown after the v8
    // coverage report has already been emitted. The doneMarker fires on the
    // report header; the 90s grace lets the table finish printing, then we
    // tree-kill any orphan Chromium so the gauntlet can advance.
    await run('coverage:browser', 'pnpm run coverage:browser', {
      doneMarker: /Coverage report from v8/,
      gracePeriodMs: 90_000,
    });
    await run('merge-subprocess-v8', 'tsx scripts/merge-subprocess-v8.ts');
    await run('coverage:merge', 'tsx scripts/merge-coverage.ts');

    // ── Phase 6: Reports + gates ───────────────────────────────────────
    await run('report:runtime-seams', 'pnpm run report:runtime-seams');
    await run('audit', 'pnpm run audit');
    await run('report:satellite-scan', 'pnpm run report:satellite-scan');
    await run('feedback:verify', 'pnpm run feedback:verify');
    await run('runtime:gate', 'pnpm run runtime:gate');
    await run('capsule:verify', 'pnpm run capsule:verify');
    await run('flex:verify', 'pnpm run flex:verify');

    // ── Summary ────────────────────────────────────────────────────────
    const totalDuration = Date.now() - gauntletStart;
    console.log(`\n${'='.repeat(60)}`);
    console.log('  GAUNTLET PASSED');
    console.log(`${'='.repeat(60)}`);
    console.log(`\n  Total wall-clock: ${formatDuration(totalDuration)}\n`);
    console.log('  Step timings:');
    for (const step of stepResults) {
      console.log(`    ${step.command.padEnd(48)} ${formatDuration(step.durationMs)}`);
    }
    console.log('');
  } catch (error) {
    const totalDuration = Date.now() - gauntletStart;
    console.error(`\n${'='.repeat(60)}`);
    console.error('  GAUNTLET FAILED');
    console.error(`${'='.repeat(60)}`);
    console.error(`\n  ${error instanceof Error ? error.message : String(error)}`);
    console.error(`\n  Failed after ${formatDuration(totalDuration)}\n`);
    process.exit(1);
  }
}

main();
