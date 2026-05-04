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
  // bin.ts is the tsx CLI entrypoint — only invoked via subprocess spawn,
  // never imported in-process. The two-statement body (`await run(); process.exit()`)
  // is exhaustively covered by every CLI integration test that spawns it.
  'packages/cli/src/bin.ts',
  // http-server.ts and stdio-server.ts hold the Node server bootstraps
  // (createServer + listen + SIGINT-await; tsx direct-invoke guard). The
  // pure handler logic lives in `http.ts` / `stdio.ts` (handleRequest /
  // respond / processLine) and is exercised by tests/unit/mcp-server/.
  // Bootstrap is exercised by the integration spawn — c8 ignore can't be
  // applied through tsx's source map during subprocess coverage merge, so
  // the bootstrap modules are excluded outright.
  'packages/mcp-server/src/http-server.ts',
  'packages/mcp-server/src/stdio-server.ts',
  // processor.ts is types + a re-export shim around processor-bootstrap.ts.
  // Both are excluded because AudioWorkletProcessor + AudioWorkletNode only
  // exist inside an AudioWorklet realm; jsdom can't load them, so this
  // surface has no in-process test path. Exercised live by the browser
  // stream-stress E2E (tests/e2e/stream.e2e.ts).
  'packages/web/src/audio/processor.ts',
  'packages/web/src/audio/processor-bootstrap.ts',
  // dev/player.ts is the browser-side scene player UI script. Top-level
  // code mutates the DOM directly (document.getElementById + addEventListener
  // calls); it can only run inside the live Vite dev server bound by
  // `startDevServer`. No in-process unit-test path.
  'packages/scene/src/dev/player.ts',
  'packages/core/src/capture.ts',
  'packages/core/src/protocol.ts',
  'packages/core/src/quantizer-types.ts',
  'packages/core/src/type-utils.ts',
  'packages/web/src/lite.ts',
  'packages/web/src/types.ts',
  'packages/worker/src/compositor-types.ts',
  // contract.ts is a pure type-declaration module (10 export type/interface,
  // 0 runtime statements). TS erases it at build time so v8 has nothing to
  // instrument; it shows 0/0/0/0 in the merged report and pollutes blind-spot
  // signals with a non-issue. Excluded so the coverage report only counts
  // files that *can* actually be measured.
  'packages/scene/src/contract.ts',
  // spawn-helpers.ts is a re-export shim — its only body is `export {...}
  // from './lib/spawn.js'`. The actual implementation in cli/src/lib/spawn.ts
  // is measured normally; v8 reports 0% on the shim because there are no
  // executable statements to track (re-export declarations aren't tracked
  // even when the re-export targets are exercised). Real consumers (vitest
  // -runner, spawn-quoting-drift drift test) keep the shim load-bearing.
  'packages/cli/src/spawn-helpers.ts',
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
];
