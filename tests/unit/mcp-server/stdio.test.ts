/**
 * Unit tests for the MCP stdio transport's line handler. Exercises the
 * extracted `processLine` function without running a real readline loop
 * (which would require subprocess plumbing on Windows).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@czap/cli', () => ({
  run: vi.fn(async () => 0),
}));

import { processLine } from '../../../packages/mcp-server/src/stdio.js';

describe('processLine — stdio framing', () => {
  it('returns null for an empty line', async () => {
    const r = await processLine('');
    expect(r).toBeNull();
  });

  it('returns null for whitespace-only lines', async () => {
    const r = await processLine('   \t  ');
    expect(r).toBeNull();
  });

  it('returns null for a notification (no body emitted on stdout)', async () => {
    const r = await processLine(JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/list',
    }));
    expect(r).toBeNull();
  });

  it('returns the JSON-encoded response for a request', async () => {
    const r = await processLine(JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
    }));
    expect(typeof r).toBe('string');
    const parsed = JSON.parse(r!);
    expect(parsed.id).toBe(1);
    expect(Array.isArray(parsed.result.tools)).toBe(true);
  });

  it('returns -32700 envelope for malformed JSON', async () => {
    const r = await processLine('garbage }}{{');
    expect(typeof r).toBe('string');
    const parsed = JSON.parse(r!);
    expect(parsed.error.code).toBe(-32700);
    expect(parsed.id).toBeNull();
  });

  it('returns null for a pure-notification batch', async () => {
    const r = await processLine(JSON.stringify([
      { jsonrpc: '2.0', method: 'tools/list' },
      { jsonrpc: '2.0', method: 'tools/list' },
    ]));
    expect(r).toBeNull();
  });
});
