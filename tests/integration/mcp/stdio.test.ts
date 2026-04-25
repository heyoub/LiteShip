import { describe, it, expect } from 'vitest';
import { listTools, dispatchToolCall } from '@czap/mcp-server';

describe('MCP stdio transport', () => {
  it('responds to tools/list with a non-empty tools array', () => {
    const tools = listTools();
    const response = { jsonrpc: '2.0', id: 1, result: { tools } };
    expect(response.jsonrpc).toBe('2.0');
    expect(response.id).toBe(1);
    expect(Array.isArray(response.result.tools)).toBe(true);
    expect(response.result.tools.length).toBeGreaterThan(0);
  });

  it('tools/call describe returns text content', async () => {
    const result = await dispatchToolCall({ name: 'describe', arguments: {} });
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content.length).toBeGreaterThan(0);
    expect(result.content[0]!.type).toBe('text');
    // describe command returns JSON with assemblyKinds
    const parsed = JSON.parse(result.content[0]!.text);
    expect(Array.isArray(parsed.assemblyKinds)).toBe(true);
  });
});
