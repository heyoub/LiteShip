/**
 * MCP HTTP server bootstrap. The pure handler logic lives in `http.ts`
 * (exported as `handleRequest` / `respond`). This module owns the
 * Node http server lifecycle (createServer + listen + SIGINT-await) and
 * is excluded from coverage because the bootstrap path can only be
 * exercised by the integration spawn at tests/integration/mcp/http.test.ts —
 * Windows can't deliver SIGINT to spawned subprocesses cleanly, so a
 * unit test would hang.
 *
 * Splitting this out lets the rest of the transport stay in coverage with
 * no `c8 ignore` annotations.
 *
 * @module
 */

import { createServer } from 'node:http';
import { handleRequest } from './http.js';

/** Run the MCP HTTP server bound to `bind` (e.g. ":3838" or "127.0.0.1:8080"). */
export async function runHttp(bind: string): Promise<void> {
  const m = bind.match(/^(?:([^:]+))?:(\d+)$/);
  const host = m?.[1] ?? '127.0.0.1';
  const port = Number(m?.[2] ?? bind);

  const server = createServer(async (req, res) => {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.end();
      return;
    }
    let body = '';
    for await (const chunk of req) body += String(chunk);

    const response = await handleRequest(body);

    res.setHeader('content-type', 'application/json');
    if (response === null) {
      // §4.1: notifications produce no body. Use 204 No Content.
      res.statusCode = 204;
      res.end();
      return;
    }
    res.end(JSON.stringify(response));
  });

  await new Promise<void>((resolve) => server.listen(port, host, () => resolve()));
  // Resolve the actual bound port — when callers pass :0 they want the
  // ephemeral port the OS chose, not the literal 0 they requested.
  const addr = server.address();
  const boundPort = typeof addr === 'object' && addr ? addr.port : port;
  process.stdout.write(
    JSON.stringify({
      status: 'ok',
      command: 'mcp',
      transport: 'http',
      url: `http://${host}:${boundPort}/`,
    }) + '\n',
  );

  await new Promise<void>((resolve) => {
    process.on('SIGINT', () => {
      server.close();
      resolve();
    });
  });
}

if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('http-server.ts') ||
  process.argv[1]?.endsWith('http.ts')
) {
  const bind = process.argv[2] ?? ':0';
  runHttp(bind).catch((err: unknown) => {
    process.stderr.write(JSON.stringify({ error: String(err) }) + '\n');
    process.exit(1);
  });
}
