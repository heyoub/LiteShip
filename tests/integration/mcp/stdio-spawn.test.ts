import { describe, it, expect } from 'vitest';
import { withSpawned, type SpawnHandle } from '../../../scripts/lib/spawn.js';

async function pipeOneRequest(handle: SpawnHandle, request: unknown): Promise<string> {
  const stdin = handle.child.stdin;
  if (!stdin) throw new Error('stdin not piped');
  stdin.write(JSON.stringify(request) + '\n');
  for await (const line of handle.readline()) {
    return line;
  }
  throw new Error('no response from stdio server');
}

describe('MCP stdio transport (auto-run guard, spawned)', () => {
  it('responds to tools/list piped via stdin', async () => {
    await withSpawned(
      'pnpm',
      ['exec', 'tsx', 'packages/mcp-server/src/stdio.ts'],
      async (handle) => {
        const responseLine = await pipeOneRequest(handle, {
          jsonrpc: '2.0', id: 1, method: 'tools/list', params: {},
        });
        const response = JSON.parse(responseLine) as {
          jsonrpc: string;
          id: number;
          result: { tools: unknown[] };
        };
        expect(response.jsonrpc).toBe('2.0');
        expect(response.id).toBe(1);
        expect(Array.isArray(response.result.tools)).toBe(true);
        expect(response.result.tools.length).toBeGreaterThan(0);
      },
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
  }, 15000);
});
