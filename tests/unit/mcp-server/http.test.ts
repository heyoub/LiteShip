/**
 * Unit tests for the MCP HTTP transport's wire handler. Exercises every
 * parse-outcome branch through `handleRequest`:
 *  - parse-error → -32700 envelope
 *  - invalid-request → -32600
 *  - notification → null body
 *  - single request → result envelope
 *  - batch with mixed requests/notifications → array, notification omitted
 *  - batch where every element is a notification → null
 *  - empty batch → -32600 invalid-request
 *
 * These mirror what the HTTP server does on POST. The server bootstrap
 * itself (createServer, listen, SIGINT) is exercised by the integration
 * test (Task 8); the inner handler now has direct in-process coverage.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@czap/cli', () => ({
  run: vi.fn(async (argv: string[]) => {
    process.stdout.write(JSON.stringify({ ok: true, argv }) + '\n');
    return 0;
  }),
}));

import { handleRequest, respond } from '../../../packages/mcp-server/src/http.js';
import { JsonRpcServer } from '../../../packages/mcp-server/src/jsonrpc.js';

describe('handleRequest — JSON-RPC 2.0 wire conformance', () => {
  it('returns -32700 ParseError envelope for malformed JSON', async () => {
    const r = await handleRequest('not json {{{');
    expect(r).not.toBeNull();
    expect(Array.isArray(r)).toBe(false);
    const env = r as { error: { code: number; message: string }; id: null };
    expect(env.error.code).toBe(-32700);
    expect(env.id).toBeNull();
  });

  it('returns -32600 InvalidRequest for empty batch arrays', async () => {
    const r = await handleRequest('[]');
    expect(r).not.toBeNull();
    const env = r as { error: { code: number } };
    expect(env.error.code).toBe(-32600);
  });

  it('returns -32600 InvalidRequest for non-conformant scalar input', async () => {
    const r = await handleRequest('42');
    expect(r).not.toBeNull();
    const env = r as { error: { code: number } };
    expect(env.error.code).toBe(-32600);
  });

  it('returns -32600 for object missing jsonrpc/method, echoing id when present', async () => {
    const r = await handleRequest(JSON.stringify({ id: 5, method: 'x' })); // missing jsonrpc
    expect(r).not.toBeNull();
    const env = r as { error: { code: number }; id: number };
    expect(env.error.code).toBe(-32600);
    expect(env.id).toBe(5);
  });

  it('returns null body for a notification (no id) — §4.1', async () => {
    const r = await handleRequest(JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/list',
      params: {},
    }));
    expect(r).toBeNull();
  });

  it('returns success envelope for a tools/list request', async () => {
    const r = await handleRequest(JSON.stringify({
      jsonrpc: '2.0',
      id: 'abc',
      method: 'tools/list',
      params: {},
    }));
    expect(r).not.toBeNull();
    const env = r as { id: string; result: { tools: unknown[] } };
    expect(env.id).toBe('abc');
    expect(Array.isArray(env.result.tools)).toBe(true);
  });

  it('returns -32601 for unknown methods in a request', async () => {
    const r = await handleRequest(JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'unknown/x',
    }));
    expect(r).not.toBeNull();
    const env = r as { error: { code: number } };
    expect(env.error.code).toBe(-32601);
  });

  it('returns an array of responses for a batch, omitting notifications', async () => {
    const body = JSON.stringify([
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      { jsonrpc: '2.0', method: 'tools/list' }, // notification
      { jsonrpc: '2.0', id: 2, method: 'unknown' }, // -32601
    ]);
    const r = await handleRequest(body);
    expect(Array.isArray(r)).toBe(true);
    const arr = r as { id?: unknown; result?: unknown; error?: { code: number } }[];
    expect(arr).toHaveLength(2);
    expect(arr.find((e) => e.id === 1)?.result).toBeDefined();
    expect(arr.find((e) => e.id === 2)?.error?.code).toBe(-32601);
  });

  it('returns null for a batch composed entirely of notifications', async () => {
    const body = JSON.stringify([
      { jsonrpc: '2.0', method: 'tools/list' },
      { jsonrpc: '2.0', method: 'tools/list', params: {} },
    ]);
    const r = await handleRequest(body);
    expect(r).toBeNull();
  });
});

describe('respond — direct ParseOutcome dispatch', () => {
  it('returns a ParseError envelope for kind: parse-error', async () => {
    const r = await respond({ kind: 'parse-error' });
    const env = r as { error: { code: number } };
    expect(env.error.code).toBe(-32700);
  });

  it('returns an InvalidRequest envelope for kind: invalid-request', async () => {
    const r = await respond({ kind: 'invalid-request', id: 7 });
    const env = r as { error: { code: number }; id: number };
    expect(env.error.code).toBe(-32600);
    expect(env.id).toBe(7);
  });

  it('forwards request kind to dispatch', async () => {
    const outcome = JsonRpcServer.parse(JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'tools/list',
    }));
    const r = await respond(outcome);
    expect(r).not.toBeNull();
    expect((r as { id: number }).id).toBe(1);
  });
});
