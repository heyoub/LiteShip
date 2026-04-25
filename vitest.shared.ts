import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Config } from './packages/core/src/config.js';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

export const repoRoot = resolve(rootDir);

export const alias: Record<string, string> = {
  ...Config.toTestAliases(Config.make({}), repoRoot),
  '@czap/_spine': resolve(repoRoot, 'packages/_spine/index.d.ts'),
};

export const coverageInclude = ['packages/*/src/**/*.ts'];

export const coverageExclude = [
  '**/dist/**',
  '**/node_modules/**',
  '**/*.d.ts',
  '**/index.ts',
  'packages/core/src/capture.ts',
  'packages/core/src/protocol.ts',
  'packages/core/src/quantizer-types.ts',
  'packages/core/src/type-utils.ts',
  'packages/web/src/lite.ts',
  'packages/web/src/types.ts',
  'packages/worker/src/compositor-types.ts',
];

export const nodeTestInclude = [
  'tests/unit/**/*.test.ts',
  'tests/integration/**/*.test.ts',
  'tests/bench/**/*.test.ts',
  'tests/smoke/**/*.test.ts',
  'tests/property/**/*.test.ts',
  'tests/component/**/*.test.ts',
  'tests/regression/**/*.test.ts',
  'tests/generated/**/*.test.ts',
  'tests/scratch/**/*.test.ts',
];
