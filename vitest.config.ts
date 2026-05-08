import { defineConfig } from 'vitest/config';
import { alias, coverageExclude, coverageInclude, nodeTestInclude } from './vitest.shared.js';

// V8 coverage instrumentation roughly doubles wall-clock time for tests that
// drive subprocess spawns (tsx startup, ts.Program type checking, ffmpeg
// piping). When --coverage is on, scale per-test and per-hook timeouts so
// integration tests don't flake under instrumentation.
//
// Non-coverage defaults are modestly above 5s so parallel `pnpm test` and
// subprocess-heavy meta suites (feedback-integrity, codebase-audit) are less
// likely to hit the default wall without an explicit per-suite timeout; heavy
// suites still set describe-level timeouts where needed.
const coverageEnabled = process.argv.includes('--coverage');

export default defineConfig({
  resolve: {
    alias,
  },
  test: {
    include: nodeTestInclude,
    exclude: ['tests/e2e/**', 'tests/browser/**'],
    setupFiles: ['tests/setup/jsdom-canvas.ts'],
    testTimeout: coverageEnabled ? 240_000 : 10_000,
    hookTimeout: coverageEnabled ? 240_000 : 20_000,
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
