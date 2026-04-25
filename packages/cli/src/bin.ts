/** tsx-runnable CLI entrypoint. Used by integration tests and by the bin/czap.mjs wrapper. */

import { run } from './index.js';

// reason: pure top-level entrypoint that calls process.exit; only exercised by spawn integration tests, never imported in-process. The two statements (await run + process.exit) are covered by every CLI integration spawn.
/* c8 ignore start */
const exitCode = await run(process.argv.slice(2));
process.exit(exitCode);
/* c8 ignore stop */
