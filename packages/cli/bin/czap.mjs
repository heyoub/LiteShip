#!/usr/bin/env node
/**
 * czap CLI shim — resolves the built dispatcher and runs it. If `dist/`
 * is missing (running from a fresh clone before `pnpm run build`), prints
 * a single-line hint instead of a Node ERR_MODULE_NOT_FOUND stack trace.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const distEntry = resolve(here, '../dist/index.js');

if (!existsSync(distEntry)) {
  process.stderr.write(
    'czap: Hull not yet laid (packages/cli/dist/ is missing).\n' +
      '  Lay the keel with: pnpm run build\n' +
      '  Or, for a one-shot rig-check without building: pnpm run doctor\n' +
      '  Or, for the full shakedown:                    pnpm setup\n',
  );
  process.exit(127);
}

const { run } = await import(distEntry);
const exitCode = await run(process.argv.slice(2));
process.exit(exitCode);
