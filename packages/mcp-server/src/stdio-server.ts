/**
 * MCP stdio server bootstrap. Provides the tsx direct-invoke entrypoint
 * for `tests/integration/mcp/stdio-spawn.test.ts`. Excluded from
 * coverage because the only way to exercise this guard is by spawning
 * the script as the entrypoint of a Node process — which is what the
 * integration test does. The pure read-line-write loop lives in
 * `stdio.ts` (`runStdio` / `processLine`) and is fully unit-tested.
 *
 * @module
 */

import { runStdio } from './stdio.js';

if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('stdio-server.ts') ||
  process.argv[1]?.endsWith('stdio.ts')
) {
  runStdio().catch((err: unknown) => {
    process.stderr.write(JSON.stringify({ error: String(err) }) + '\n');
    process.exit(1);
  });
}
