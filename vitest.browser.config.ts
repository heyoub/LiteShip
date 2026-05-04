import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { alias, coverageExclude, coverageInclude } from './vitest.shared.js';
import { startSceneDev, stopSceneDev } from './tests/browser/commands/scene-dev-spawn.js';

const coverageEnabled = process.argv.includes('--coverage');
const isCI = process.env.CI !== undefined && process.env.CI !== '';

const browserInstances = (coverageEnabled ? 'chromium' : process.env.CZAP_VITEST_BROWSERS ?? 'chromium,firefox,webkit')
  .split(',')
  .map((browser) => browser.trim())
  .filter((browser): browser is 'chromium' | 'firefox' | 'webkit' =>
    browser === 'chromium' || browser === 'firefox' || browser === 'webkit',
  )
  .map((browser) => ({ browser }));

// Coverage reporters: the merge step consumes `json` (coverage-final.json).
// We use `text-summary` (totals only) instead of `text` here because the
// browser run only loads a fraction of the source tree — most files report
// 0% during this phase, which prints a 200+ line table that looks
// catastrophic to readers but is meaningless until the merge step folds in
// the in-process Node coverage. The merge step (coverage:merge) prints the
// real per-file table once. `html` + `lcov` produce large on-disk trees
// that local feedback loops don't use -- only CI keeps them so downstream
// tooling (PR artifact uploads, drill-down browsing) still has them. Local
// runs drop to `text-summary` + `json` to avoid the disk write overhead
// without losing any merge-critical data.
const coverageReporters = isCI
  ? (['text-summary', 'html', 'lcov', 'json'] as const)
  : (['text-summary', 'json'] as const);

export default defineConfig({
  resolve: {
    alias,
  },
  optimizeDeps: {
    // Persist dep optimization cache in a stable location so Vite doesn't
    // re-optimize on every browser coverage run. The node config uses the
    // default cache dir; this gives the browser config its own stable cache.
    holdUntilCrawlEnd: true,
  },
  cacheDir: 'node_modules/.vite-browser',
  test: {
    include: ['tests/browser/**/*.test.ts'],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: browserInstances,
      commands: {
        startSceneDev,
        stopSceneDev,
      },
    },
    coverage: {
      provider: 'v8',
      reportOnFailure: true,
      reportsDirectory: './coverage/browser',
      reporter: [...coverageReporters],
      include: coverageInclude,
      exclude: coverageExclude,
    },
  },
});
