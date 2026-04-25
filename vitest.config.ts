import { defineConfig } from 'vitest/config';
import { alias, coverageExclude, coverageInclude, nodeTestInclude } from './vitest.shared.js';

export default defineConfig({
  resolve: {
    alias,
  },
  test: {
    include: nodeTestInclude,
    exclude: ['tests/e2e/**', 'tests/browser/**'],
    setupFiles: ['tests/setup/jsdom-canvas.ts'],
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
