/**
 * MCP HTTP transport — POST /, body is a JSON-RPC 2.0 request.
 * Emits a startup receipt to stdout so callers know the server is live.
 *
 * Routes incoming bodies through `JsonRpcServer.parse` for the same
 * conformance properties as the stdio transport: parse errors → -32700,
 * notifications produce no body, batches handled per §6.
 *
 * @module
 */

import { createServer } from 'node:http';
import { dispatch } from './dispatch.js';
import {
  JsonRpcServer,
  type JsonRpcResponse,
  type ParseOutcome,
  errorResponse,
  ParseError,
  InvalidRequest,
} from './jsonrpc.js';

/** Run the MCP HTTP server bound to `bind` (e.g. ":3838" or "127.0.0.1:8080"). */
export async function runHttp(bind: string): Promise<void> {
  const m = bind.match(/^(?:([^:]+))?:(\d+)$/);
  const host = m?.[1] ?? '127.0.0.1';
  const port = Number(m?.[2] ?? bind);

  const server = createServer(async (req, res) => {
    if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
    let body = '';
    for await (const chunk of req) body += String(chunk);

    const outcome = JsonRpcServer.parse(body);
    const response = await respond(outcome);

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
      status: 'ok', command: 'mcp',
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

/**
 * Resolve a parse outcome to its wire response, or `null` if the spec
 * requires no response (notification, or pure-notification batch).
 */
async function respond(
  outcome: ParseOutcome,
): Promise<JsonRpcResponse | readonly JsonRpcResponse[] | null> {
  switch (outcome.kind) {
    case 'parse-error':
      return errorResponse(null, ParseError, 'Parse error');
    case 'invalid-request':
      return errorResponse(outcome.id, InvalidRequest, 'Invalid Request');
    case 'notification':
      await dispatch(outcome.message);
      return null;
    case 'request':
      return dispatch(outcome.message);
    case 'batch': {
      const responses: JsonRpcResponse[] = [];
      for (const sub of outcome.outcomes) {
        const r = await respond(sub);
        if (r === null) continue;
        if (Array.isArray(r)) responses.push(...r);
        else responses.push(r as JsonRpcResponse);
      }
      return responses.length > 0 ? responses : null;
    }
  }
}

// Allow direct tsx invocation for integration tests (mirrors stdio.ts pattern).
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('http.ts')) {
  const bind = process.argv[2] ?? ':0';
  runHttp(bind).catch((err: unknown) => {
    process.stderr.write(JSON.stringify({ error: String(err) }) + '\n');
    process.exit(1);
  });
}
