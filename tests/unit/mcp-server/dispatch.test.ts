/**
 * Unit tests for the MCP `dispatch` router. Exercises every branch:
 *  - tools/list, tools/call success, tools/call missing params (-32602)
 *  - method-not-found (-32601)
 *  - notification path (returns null per §4.1)
 *  - internal error mapping (-32603)
 *  - listTools surface
 *  - dispatchToolCall capturing CLI stdout into the MCP envelope
 */
import { describe, it, expect, vi } from 'vitest';

// Mock the `@czap/cli` `run` import so dispatchToolCall doesn't actually
// execute a CLI command; we just need to verify the envelope shape.
vi.mock('@czap/cli', () => ({
  run: vi.fn(async (argv: string[]) => {
    if (argv[0] === 'fail') {
      process.stdout.write('error output line\n');
      return 1;
    }
    if (argv[0] === 'crash') {
      throw new Error('boom');
    }
    process.stdout.write(JSON.stringify({ ok: true, argv }) + '\n');
    return 0;
  }),
}));

import {
  dispatch,
  dispatchToolCall,
  listTools,
} from '../../../packages/mcp-server/src/dispatch.js';
import type { JsonRpcRequest, JsonRpcNotification } from '../../../packages/mcp-server/src/jsonrpc.js';

function makeRequest(method: string, params?: unknown, id: string | number = 1): JsonRpcRequest {
  return params === undefined
    ? { jsonrpc: '2.0', id, method }
    : { jsonrpc: '2.0', id, method, params: params as Record<string, unknown> };
}

function makeNotification(method: string, params?: unknown): JsonRpcNotification {
  return params === undefined
    ? { jsonrpc: '2.0', method }
    : { jsonrpc: '2.0', method, params: params as Record<string, unknown> };
}

describe('dispatch — JSON-RPC method routing', () => {
  it('responds to tools/list with the static tool catalog', async () => {
    const r = await dispatch(makeRequest('tools/list', {}));
    expect(r).not.toBeNull();
    expect(r!.jsonrpc).toBe('2.0');
    expect(r!.id).toBe(1);
    expect('result' in r!).toBe(true);
    const result = (r as { result: { tools: unknown[] } }).result;
    expect(Array.isArray(result.tools)).toBe(true);
    expect(result.tools.length).toBeGreaterThan(5);
  });

  it('responds to tools/call success', async () => {
    const r = await dispatch(makeRequest('tools/call', {
      name: 'describe',
      arguments: { format: 'json' },
    }));
    expect(r).not.toBeNull();
    expect('result' in r!).toBe(true);
    const result = (r as { result: { content: Array<{ text: string }>; isError: boolean } }).result;
    expect(result.isError).toBe(false);
    expect(result.content[0]!.text).toMatch(/argv/);
  });

  it('returns -32602 (Invalid Params) when tools/call lacks { name, arguments }', async () => {
    const r = await dispatch(makeRequest('tools/call', { wrong: 'shape' }));
    expect(r).not.toBeNull();
    expect('error' in r!).toBe(true);
    const err = (r as { error: { code: number; message: string } }).error;
    expect(err.code).toBe(-32602);
    expect(err.message).toMatch(/name/);
  });

  it('returns -32602 when tools/call params are missing entirely', async () => {
    const r = await dispatch(makeRequest('tools/call'));
    expect(r).not.toBeNull();
    const err = (r as { error: { code: number } }).error;
    expect(err.code).toBe(-32602);
  });

  it('returns -32601 (Method Not Found) for unknown methods', async () => {
    const r = await dispatch(makeRequest('unknown/method'));
    expect(r).not.toBeNull();
    const err = (r as { error: { code: number; data?: { method: string } } }).error;
    expect(err.code).toBe(-32601);
    expect(err.data?.method).toBe('unknown/method');
  });

  it('returns null for notifications (§4.1)', async () => {
    const r = await dispatch(makeNotification('tools/list', {}));
    expect(r).toBeNull();
  });

  it('returns null for notification even when method is unknown', async () => {
    const r = await dispatch(makeNotification('unknown/method'));
    expect(r).toBeNull();
  });

  it('returns null for notification even when handler throws', async () => {
    const r = await dispatch(makeNotification('tools/call', {
      name: 'crash',
      arguments: {},
    }));
    expect(r).toBeNull();
  });

  it('maps generic handler exceptions to -32603 Internal Error', async () => {
    const r = await dispatch(makeRequest('tools/call', {
      name: 'crash',
      arguments: {},
    }));
    expect(r).not.toBeNull();
    const err = (r as { error: { code: number; message: string } }).error;
    expect(err.code).toBe(-32603);
    expect(err.message).toBe('Internal error');
  });
});

describe('dispatchToolCall — argv builder + stdout capture', () => {
  it('translates dotted tool names into argv segments', async () => {
    const result = await dispatchToolCall({
      name: 'scene.compile',
      arguments: { scene: 'foo.ts' },
    });
    expect(result.isError).toBe(false);
    expect(result.content[0]!.text).toMatch(/scene/);
    expect(result.content[0]!.text).toMatch(/compile/);
  });

  it('emits boolean true args as bare flags', async () => {
    const result = await dispatchToolCall({
      name: 'gauntlet',
      arguments: { 'dry-run': true },
    });
    expect(result.isError).toBe(false);
    // Our mocked `run` echoes argv into stdout.
    expect(result.content[0]!.text).toMatch(/--dry-run/);
  });

  it('omits boolean false args from argv', async () => {
    const result = await dispatchToolCall({
      name: 'gauntlet',
      arguments: { 'dry-run': false },
    });
    expect(result.isError).toBe(false);
    expect(result.content[0]!.text).not.toMatch(/--dry-run/);
  });

  it('marks isError true when the underlying CLI exits non-zero', async () => {
    const result = await dispatchToolCall({
      name: 'fail',
      arguments: {},
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/error/);
  });
});

describe('listTools — static tool catalog', () => {
  it('lists at least the 10 spec-required czap tools', () => {
    const tools = listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain('describe');
    expect(names).toContain('scene.compile');
    expect(names).toContain('scene.render');
    expect(names).toContain('scene.verify');
    expect(names).toContain('asset.analyze');
    expect(names).toContain('asset.verify');
    expect(names).toContain('capsule.inspect');
    expect(names).toContain('capsule.verify');
    expect(names).toContain('capsule.list');
    expect(names).toContain('gauntlet');
  });

  it('every tool carries an inputSchema object', () => {
    for (const t of listTools()) {
      expect(typeof t.inputSchema).toBe('object');
      expect((t.inputSchema as { type?: string }).type).toBe('object');
    }
  });
});
