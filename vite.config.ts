import { defineConfig } from 'vite-plus';
import { Config } from './packages/core/src/config.js';

const repoRoot = __dirname;
const alias = Config.toTestAliases(Config.make({}), repoRoot);

export default defineConfig({
  resolve: {
    alias,
  },
  test: {
    include: [
      'tests/unit/**/*.test.ts',
      'tests/integration/**/*.test.ts',
      'tests/bench/**/*.test.ts',
      'tests/smoke/**/*.test.ts',
      'tests/property/**/*.test.ts',
      'tests/component/**/*.test.ts',
      'tests/regression/**/*.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['packages/*/src/**/*.ts'],
      exclude: [
        '**/dist/**',
        '**/node_modules/**',
        // Browser-only modules that cannot be tested in vitest (no DOM/WebGL/AudioWorklet).
        // Documented in docs/STATUS.md B.4/B.5.
        '**/capture/**',
        '**/audio/**',
        '**/slot/registry.ts',
        '**/physical/**',
        // Barrel re-exports with no logic
        '**/index.ts',
      ],
      thresholds: {
        lines: 71,
        branches: 57,
        functions: 74,
        statements: 72,
      },
    },
  },
});
