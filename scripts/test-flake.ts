import { resolve } from 'node:path';
import { runPnpm } from './support/pnpm-process.js';

const root = resolve(import.meta.dirname, '..');
const nodeTargets = [
  'tests/unit/animation.test.ts',
  'tests/unit/astro-runtime.test.ts',
  'tests/unit/astro-directives.test.ts',
  'tests/unit/llm-adapter.test.ts',
  'tests/component/worker-host.test.ts',
];
const browserTargets = ['tests/browser/astro-stream-llm.test.ts'];
const repetitions = 5;
const browserFlakeEnv = {
  CZAP_VITEST_BROWSERS: process.env.CZAP_VITEST_BROWSERS ?? 'chromium',
};

async function runSuite(
  label: string,
  args: readonly string[],
  options?: { readonly env?: NodeJS.ProcessEnv },
): Promise<void> {
  for (let iteration = 1; iteration <= repetitions; iteration++) {
    console.log(`[flake] ${label} iteration ${iteration}/${repetitions}`);
    const result = await runPnpm(args, { cwd: root, env: options?.env });
    if (result.code !== 0) {
      process.stdout.write(result.stdout);
      process.stderr.write(result.stderr);
      throw new Error(`${label} flake pass failed on iteration ${iteration}.`);
    }
  }
}

await runSuite('node runtime-sensitive tests', [
  'exec',
  'vitest',
  'run',
  '--config',
  'vitest.config.ts',
  ...nodeTargets,
]);
await runSuite('browser runtime-sensitive tests', [
  'exec',
  'vitest',
  'run',
  '--config',
  'vitest.browser.config.ts',
  ...browserTargets,
], {
  env: browserFlakeEnv,
});

console.log('[flake] all runtime-sensitive repetitions passed cleanly.');
