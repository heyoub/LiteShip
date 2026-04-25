import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const packageJson = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '..', '..', '..', 'package.json'), 'utf8'),
) as {
  scripts: Record<string, string>;
};

describe('gauntlet ordering', () => {
  test('full gauntlet uses the parallel orchestrator', () => {
    expect(packageJson.scripts['gauntlet:full']).toBe('tsx scripts/gauntlet.ts');
  });

  test('serial gauntlet preserves the canonical sequential artifact order', () => {
    expect(packageJson.scripts['gauntlet:serial']).toBe(
      'pnpm run build && pnpm run typecheck && pnpm run lint && pnpm run docs:check && pnpm exec tsx scripts/check-invariants.ts && pnpm test && pnpm run test:vite && pnpm run test:astro && pnpm run test:tailwind && pnpm run test:e2e && pnpm run test:e2e:stress && pnpm run test:e2e:stream-stress && pnpm run test:flake && pnpm run test:redteam && pnpm run bench && pnpm run bench:gate && pnpm run bench:reality && pnpm run package:smoke && pnpm run coverage:merge && pnpm run report:runtime-seams && pnpm run audit && pnpm run report:satellite-scan && pnpm run feedback:verify && pnpm run runtime:gate && pnpm run flex:verify',
    );
  });

  test('feedback verifier is available as a root script', () => {
    expect(packageJson.scripts['feedback:verify']).toBe('pnpm exec tsx scripts/feedback-verify.ts');
    expect(packageJson.scripts['runtime:gate']).toBe('pnpm exec tsx scripts/runtime-gate.ts');
  });

  test('flex:verify roll-up acceptance script is available and wired as terminal step', () => {
    expect(packageJson.scripts['flex:verify']).toBe('pnpm exec tsx scripts/flex-verify.ts');
    expect(packageJson.scripts['gauntlet:serial']).toContain('&& pnpm run flex:verify');
    // flex:verify must be the terminal step (last token in the chain)
    const serial = packageJson.scripts['gauntlet:serial'] ?? '';
    expect(serial.endsWith('&& pnpm run flex:verify')).toBe(true);
  });

  test('flake, reality, and satellite scan lanes are available as root scripts', () => {
    expect(packageJson.scripts['test:flake']).toBe('pnpm exec tsx scripts/test-flake.ts');
    expect(packageJson.scripts['bench:reality']).toBe('pnpm run build && tsx scripts/bench-reality.ts');
    expect(packageJson.scripts['report:satellite-scan']).toBe('pnpm exec tsx scripts/report-satellite-scan.ts');
  });
});
