import { describe, it, expect } from 'vitest';
import { withSpawned, type SpawnHandle } from '../../../scripts/lib/spawn.js';

interface JsonRpcResponse {
  jsonrpc?: string;
  id?: number | string | null;
  result?: unknown;
  error?: { code: number; message: string };
}

async function readUrl(handle: SpawnHandle): Promise<string> {
  const deadline = Date.now() + 10000;
  for await (const line of handle.readline()) {
    if (Date.now() > deadline) throw new Error('timeout waiting for url');
    if (!line.trim().startsWith('{')) continue;
    try {
      const receipt = JSON.parse(line) as { url?: unknown };
      if (typeof receipt.url === 'string') return receipt.url;
    } catch { /* not yet */ }
  }
  throw new Error('subprocess closed without emitting url');
}

async function rpc(url: string, body: unknown, opts: { method?: string } = {}): Promise<{ status: number; body: string }> {
  const method = opts.method ?? 'POST';
  const init: RequestInit = {
    method,
    headers: { 'content-type': 'application/json' },
  };
  if (method !== 'GET' && method !== 'HEAD') {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  const res = await fetch(url, init);
  return { status: res.status, body: await res.text() };
}

describe('MCP http transport (spawned)', () => {
  it('handles tools/list, tools/call, parse-error, batch, and non-POST 405', async () => {
    await withSpawned(
      'pnpm',
      ['exec', 'tsx', 'packages/mcp-server/src/http.ts', ':0'],
      async (handle) => {
        const url = await readUrl(handle);

        // tools/list
        const listRes = await rpc(url, { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
        expect(listRes.status).toBe(200);
        const listBody = JSON.parse(listRes.body) as JsonRpcResponse;
        expect(Array.isArray((listBody.result as { tools: unknown[] }).tools)).toBe(true);
        expect((listBody.result as { tools: unknown[] }).tools.length).toBeGreaterThan(0);

        // tools/call describe
        const callRes = await rpc(url, {
          jsonrpc: '2.0', id: 2, method: 'tools/call',
          params: { name: 'describe', arguments: {} },
        });
        expect(callRes.status).toBe(200);
        const callBody = JSON.parse(callRes.body) as JsonRpcResponse;
        expect(Array.isArray((callBody.result as { content: unknown[] }).content)).toBe(true);

        // parse error → -32700, id null
        const parseErrRes = await rpc(url, '{not valid json');
        expect(parseErrRes.status).toBe(200);
        const parseErrBody = JSON.parse(parseErrRes.body) as JsonRpcResponse;
        expect(parseErrBody.error?.code).toBe(-32700);
        expect(parseErrBody.id).toBe(null);

        // batch with one request and one notification (notification produces no entry)
        const batchRes = await rpc(url, [
          { jsonrpc: '2.0', id: 3, method: 'tools/list', params: {} },
          { jsonrpc: '2.0', method: 'tools/list', params: {} }, // notification, no id
        ]);
        expect(batchRes.status).toBe(200);
        const batchBody = JSON.parse(batchRes.body) as JsonRpcResponse[];
        expect(Array.isArray(batchBody)).toBe(true);
        expect(batchBody.length).toBe(1);
        expect(batchBody[0].id).toBe(3);

        // notification-only batch produces 204 No Content
        const notifBatchRes = await rpc(url, [
          { jsonrpc: '2.0', method: 'tools/list', params: {} },
        ]);
        expect(notifBatchRes.status).toBe(204);
        expect(notifBatchRes.body).toBe('');

        // non-POST → 405
        const getRes = await rpc(url, '', { method: 'GET' });
        expect(getRes.status).toBe(405);
      },
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
  }, 25000);
});
