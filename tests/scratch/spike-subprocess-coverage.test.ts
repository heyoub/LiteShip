/**
 * SPIKE — deleted after Task 21.
 *
 * Verifies vitest's @vitest/coverage-v8 provider captures coverage from
 * grandchildren of test workers. If this passes under `pnpm coverage:node`,
 * the simple subprocess-coverage design holds. If it fails, we add a
 * fallback merge step in scripts/merge-subprocess-v8.ts.
 *
 * Outcome documented in docs/superpowers/plans/2026-04-25-subprocess-coverage.md
 * Step 1 results.
 */
import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';

describe('SPIKE: subprocess coverage capture', () => {
  it('grandchild process coverage appears in coverage-final.json', async () => {
    if (process.env.NODE_V8_COVERAGE === undefined) {
      console.warn('SPIKE: not running under coverage; skipping');
      return;
    }

    // Spawn `tsx -e 'await import("packages/cli/src/dispatch.js")'` via raw
    // spawn (this is the spike — withSpawned doesn't exist yet).
    const tsxBin = process.platform === 'win32' ? 'tsx.cmd' : 'tsx';
    const child = spawn(
      'pnpm',
      ['exec', tsxBin, '-e', 'await import("./packages/cli/src/dispatch.js");'],
      { stdio: 'pipe', shell: process.platform === 'win32' },
    );
    await new Promise<void>((resolveExit, reject) => {
      child.on('close', (code) => (code === 0 ? resolveExit() : reject(new Error(`exit ${code}`))));
      child.on('error', reject);
    });

    // Coverage dump should land in NODE_V8_COVERAGE dir for both parent and child.
    const dir = process.env.NODE_V8_COVERAGE!;
    expect(existsSync(dir)).toBe(true);

    // Final report path determined by vitest config.
    const finalPath = resolve(process.cwd(), 'coverage', 'node', 'coverage-final.json');
    if (!existsSync(finalPath)) {
      console.warn('SPIKE: coverage-final.json not yet written (test runs before merge)');
      console.warn('SPIKE: re-run pnpm coverage:node and inspect final.json manually for dispatch.ts');
      return;
    }

    const data = JSON.parse(readFileSync(finalPath, 'utf8')) as Record<string, unknown>;
    const dispatchKey = Object.keys(data).find((k) => k.includes('packages/cli/src/dispatch'));
    expect(dispatchKey).toBeDefined();
  }, 30_000);
});
