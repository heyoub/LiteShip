/**
 * MCP notification handling — verifies the dispatcher returns null for
 * notifications (§4.1: the server MUST NOT respond), while requests
 * with an `id` field always produce a response (success or error).
 *
 * @module
 */

import { describe, it, expect } from 'vitest';
import { dispatch } from '@czap/mcp-server';

describe('MCP notification handling (§4.1)', () => {
  it('dispatch returns null for a tools/list notification (no id field)', async () => {
    const notification = { jsonrpc: '2.0' as const, method: 'tools/list' };
    const result = await dispatch(notification);
    expect(result).toBeNull();
  });

  it('dispatch returns null for an unknown-method notification', async () => {
    const notification = { jsonrpc: '2.0' as const, method: 'does-not-exist' };
    const result = await dispatch(notification);
    expect(result).toBeNull();
  });

  it('dispatch returns a response for a request with id', async () => {
    const request = { jsonrpc: '2.0' as const, id: 1, method: 'tools/list' };
    const result = await dispatch(request);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.jsonrpc).toBe('2.0');
      expect(result.id).toBe(1);
      expect('result' in result).toBe(true);
    }
  });

  it('dispatch returns -32601 for an unknown method on a request', async () => {
    const request = { jsonrpc: '2.0' as const, id: 'x', method: 'no-such-method' };
    const result = await dispatch(request);
    expect(result).not.toBeNull();
    if (result && 'error' in result) {
      expect(result.error.code).toBe(-32601);
      expect(result.id).toBe('x');
    } else {
      throw new Error('expected error response');
    }
  });

  it('dispatch returns id null with explicit id null on a request', async () => {
    const request = { jsonrpc: '2.0' as const, id: null, method: 'tools/list' };
    const result = await dispatch(request);
    expect(result).not.toBeNull();
    if (result) expect(result.id).toBeNull();
  });

  it('dispatch returns -32602 for tools/call with malformed params', async () => {
    // §5.1: Invalid method parameter(s) → -32602 (NOT -32603 Internal error,
    // which was the pre-fix behavior).
    const request = {
      jsonrpc: '2.0' as const,
      id: 1,
      method: 'tools/call',
      params: { not_a_name: 42 } as unknown as Record<string, unknown>,
    };
    const result = await dispatch(request);
    expect(result).not.toBeNull();
    if (result && 'error' in result) {
      expect(result.error.code).toBe(-32602);
    } else {
      throw new Error('expected -32602 error response');
    }
  });
});
