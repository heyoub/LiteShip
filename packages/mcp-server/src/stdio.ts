/**
 * MCP stdio server — reads JSON-RPC 2.0 framed messages line-by-line from
 * stdin, writes responses to stdout. Routes every line through
 * `JsonRpcServer.parse` so parse errors emit -32700 (was silently dropped)
 * and notifications produce no response (§4.1).
 *
 * @module
 */

import { createInterface } from 'node:readline/promises';
import { dispatch } from './dispatch.js';
import {
  JsonRpcServer,
  type JsonRpcResponse,
  type ParseOutcome,
  errorResponse,
  ParseError,
  InvalidRequest,
} from './jsonrpc.js';

/** Run the MCP stdio loop until stdin closes. */
export async function runStdio(): Promise<void> {
  const rl = createInterface({ input: process.stdin });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const outcome = JsonRpcServer.parse(line);
    const response = await respond(outcome);
    if (response !== null) {
      process.stdout.write(JSON.stringify(response) + '\n');
    }
  }
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
      // §4.2: parse errors MUST emit -32700 with id null.
      return errorResponse(null, ParseError, 'Parse error');
    case 'invalid-request':
      // §5.1: -32600 invalid request — id echoed when extractable.
      return errorResponse(outcome.id, InvalidRequest, 'Invalid Request');
    case 'notification':
      // §4.1: notifications MUST NOT receive a response.
      // Still process side-effects via dispatch so the handler runs.
      await dispatch(outcome.message);
      return null;
    case 'request':
      return dispatch(outcome.message);
    case 'batch': {
      // §6: respond with array of per-element responses, omitting nulls
      // (notifications). If every element was a notification, return null
      // so we send no batch envelope at all.
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

// Allow direct tsx invocation for integration tests.
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('stdio.ts')) {
  runStdio().catch((err: unknown) => {
    process.stderr.write(JSON.stringify({ error: String(err) }) + '\n');
    process.exit(1);
  });
}
