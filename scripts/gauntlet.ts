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

import { spawn, type ChildProcess } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const LOG_DIR = resolve(ROOT, 'coverage');

interface StepResult {
  command: string;
  durationMs: number;
}

const stepResults: StepResult[] = [];

function run(label: string, command: string): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`  ${label}`);
    console.log(`${'='.repeat(60)}\n`);

    const child = spawn(command, {
      shell: true,
      stdio: 'inherit',
      cwd: ROOT,
      env: { ...process.env, FORCE_COLOR: '1' },
    });

    child.on('close', (code) => {
      const durationMs = Date.now() - start;
      stepResults.push({ command: label, durationMs });
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`"${label}" failed with exit code ${code}`));
      }
    });

    child.on('error', (err) => {
      reject(new Error(`"${label}" spawn error: ${err.message}`));
    });
  });
}

interface BackgroundHandle {
  label: string;
  child: ChildProcess;
  promise: Promise<void>;
  startTime: number;
}

function runBackground(label: string, command: string): BackgroundHandle {
  mkdirSync(LOG_DIR, { recursive: true });
  const logPath = resolve(LOG_DIR, 'browser-coverage.log');
  const logStream = createWriteStream(logPath, { flags: 'w' });

  console.log(`\n  [background] Starting: ${label}`);
  console.log(`  [background] Output logged to: ${logPath}\n`);

  const child = spawn(command, {
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: ROOT,
    env: { ...process.env, FORCE_COLOR: '0' },
  });

  child.stdout?.pipe(logStream);
  child.stderr?.pipe(logStream);

  const startTime = Date.now();

  const promise = new Promise<void>((resolve, reject) => {
    child.on('close', (code) => {
      logStream.end();
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`[background] "${label}" failed with exit code ${code}. See ${logPath}`));
      }
    });

    child.on('error', (err) => {
      logStream.end();
      reject(new Error(`[background] "${label}" spawn error: ${err.message}`));
    });
  });

  return { label, child, promise, startTime };
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

    // ── Phase 3: Fork browser coverage in background ───────────────────
    // Browser coverage is the bottleneck (~50-80 min on Windows with v8
    // instrumentation on Chromium). By starting it here and running it
    // concurrently with Phase 4, we reclaim ~15 min of wall-clock time.
    const browserCoverage = runBackground(
      'coverage:browser',
      'pnpm run coverage:browser',
    );

    // ── Phase 4: Integration, e2e, stress, bench (overlaps with browser coverage) ──
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

    // ── Phase 5: Node coverage (tracked) + wait for browser + merge ────
    // coverage:node:tracked sets NODE_V8_COVERAGE so spawn-helper subprocesses
    // emit raw v8 dumps into coverage/subprocess-raw. merge-subprocess-v8
    // then converts via v8-to-istanbul and unions into coverage/node/coverage-final.json
    // before merge-coverage.ts gates the merged report.
    await run('coverage:wipe-subprocess', 'rimraf coverage/subprocess-raw');
    await run('coverage:node:tracked', 'pnpm run coverage:node:tracked');

    console.log(`\n  [background] Waiting for browser coverage to finish...`);
    const browserWaitStart = Date.now();
    await browserCoverage.promise;
    const browserDuration = Date.now() - browserCoverage.startTime;
    const waitDuration = Date.now() - browserWaitStart;
    stepResults.push({ command: 'coverage:browser (background)', durationMs: browserDuration });
    console.log(`  [background] Browser coverage finished in ${formatDuration(browserDuration)}`);
    if (waitDuration > 1000) {
      console.log(`  [background] Waited ${formatDuration(waitDuration)} after Phase 4 completed`);
    } else {
      console.log(`  [background] Browser coverage was already done — zero wait!`);
    }

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
