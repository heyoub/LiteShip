import { defineConfig } from 'vitest/config';
import { alias, coverageExclude, coverageInclude, nodeTestInclude } from './vitest.shared.js';

// V8 coverage instrumentation roughly doubles wall-clock time for tests that
// drive subprocess spawns (tsx startup, ts.Program type checking, ffmpeg
// piping). When --coverage is on, scale per-test and per-hook timeouts so
// integration tests don't flake under instrumentation. Standalone runs keep
// the default behavior.
const coverageEnabled = process.argv.includes('--coverage');

export default defineConfig({
  resolve: {
    alias,
  },
  test: {
    include: nodeTestInclude,
    exclude: ['tests/e2e/**', 'tests/browser/**'],
    setupFiles: ['tests/setup/jsdom-canvas.ts'],
    testTimeout: coverageEnabled ? 240_000 : 5_000,
    hookTimeout: coverageEnabled ? 240_000 : 10_000,
    coverage: {
      provider: 'v8',
      reportOnFailure: true,
      reportsDirectory: './coverage/node',
      reporter: ['text', 'html', 'lcov', 'json'],
      include: coverageInclude,
      exclude: coverageExclude,
    },
  },
});
