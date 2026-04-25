/**
 * JSON-RPC 2.0 conformance suite — transcribes the spec's normative
 * requirements (https://www.jsonrpc.org/specification) so the kernel
 * cannot regress on §4.1 (notification suppression), §4.2 (parse error
 * envelope), §5.1 (error code numbering), or §6 (batch handling).
 *
 * @module
 */

import { describe, it, expect } from 'vitest';
import {
  JsonRpcServer,
  ParseError,
  InvalidRequest,
  MethodNotFound,
  InvalidParams,
  InternalError,
  errorResponse,
  successResponse,
} from '@czap/mcp-server';

describe('JSON-RPC 2.0 §4.2 — parse error', () => {
  it('classifies malformed JSON as parse-error', () => {
    expect(JsonRpcServer.parse('{not json').kind).toBe('parse-error');
  });

  it('classifies a stray brace as parse-error', () => {
    expect(JsonRpcServer.parse('}').kind).toBe('parse-error');
  });

  it('errorResponse encodes -32700 with id null per §4.2', () => {
    expect(errorResponse(null, ParseError, 'Parse error')).toEqual({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'Parse error' },
    });
  });
});

describe('JSON-RPC 2.0 §4.1 — notification', () => {
  it('classifies a method-only object (no id) as notification', () => {
    const out = JsonRpcServer.parse('{"jsonrpc":"2.0","method":"foo"}');
    expect(out.kind).toBe('notification');
  });

  it('classifies a notification with positional params', () => {
    const out = JsonRpcServer.parse('{"jsonrpc":"2.0","method":"update","params":[1,2,3,4,5]}');
    expect(out.kind).toBe('notification');
    if (out.kind === 'notification') {
      expect(out.message.method).toBe('update');
      expect(out.message.params).toEqual([1, 2, 3, 4, 5]);
    }
  });

  it('does NOT classify as notification when id is null (still a request per §4)', () => {
    // Per spec §4: id can be null for explicit-null requests; only an
    // ABSENT id field signals a notification.
    const out = JsonRpcServer.parse('{"jsonrpc":"2.0","method":"foo","id":null}');
    expect(out.kind).toBe('request');
    if (out.kind === 'request') expect(out.message.id).toBeNull();
  });
});

describe('JSON-RPC 2.0 §4 — id semantics', () => {
  it('accepts string id', () => {
    const out = JsonRpcServer.parse('{"jsonrpc":"2.0","method":"foo","id":"abc"}');
    expect(out.kind).toBe('request');
    if (out.kind === 'request') expect(out.message.id).toBe('abc');
  });

  it('accepts numeric id', () => {
    const out = JsonRpcServer.parse('{"jsonrpc":"2.0","method":"foo","id":42}');
    expect(out.kind).toBe('request');
    if (out.kind === 'request') expect(out.message.id).toBe(42);
  });

  it('accepts null id', () => {
    const out = JsonRpcServer.parse('{"jsonrpc":"2.0","method":"foo","id":null}');
    expect(out.kind).toBe('request');
    if (out.kind === 'request') expect(out.message.id).toBeNull();
  });
});

describe('JSON-RPC 2.0 §5 — invalid request', () => {
  it('rejects bare numeric scalar', () => {
    expect(JsonRpcServer.parse('1').kind).toBe('invalid-request');
  });

  it('rejects bare string scalar', () => {
    expect(JsonRpcServer.parse('"hello"').kind).toBe('invalid-request');
  });

  it('rejects bare null', () => {
    expect(JsonRpcServer.parse('null').kind).toBe('invalid-request');
  });

  it('rejects object missing the jsonrpc field', () => {
    expect(JsonRpcServer.parse('{"method":"foo","id":1}').kind).toBe('invalid-request');
  });

  it('rejects object with wrong jsonrpc version', () => {
    expect(JsonRpcServer.parse('{"jsonrpc":"1.0","method":"foo","id":1}').kind).toBe(
      'invalid-request',
    );
  });

  it('rejects object missing the method field', () => {
    expect(JsonRpcServer.parse('{"jsonrpc":"2.0","id":1}').kind).toBe('invalid-request');
  });

  it('rejects object with non-string method', () => {
    expect(JsonRpcServer.parse('{"jsonrpc":"2.0","method":42,"id":1}').kind).toBe(
      'invalid-request',
    );
  });

  it('echoes the id when invalid-request still has a valid id field', () => {
    const out = JsonRpcServer.parse('{"jsonrpc":"1.0","method":"foo","id":7}');
    expect(out.kind).toBe('invalid-request');
    if (out.kind === 'invalid-request') expect(out.id).toBe(7);
  });

  it('uses null id when the request id is itself ill-typed', () => {
    const out = JsonRpcServer.parse('{"jsonrpc":"2.0","id":[1,2]}');
    expect(out.kind).toBe('invalid-request');
    if (out.kind === 'invalid-request') expect(out.id).toBeNull();
  });
});

describe('JSON-RPC 2.0 §5.1 — standard error codes', () => {
  it('exposes the five standard codes with the spec-mandated numbers', () => {
    expect(ParseError).toBe(-32700);
    expect(InvalidRequest).toBe(-32600);
    expect(MethodNotFound).toBe(-32601);
    expect(InvalidParams).toBe(-32602);
    expect(InternalError).toBe(-32603);
  });

  it('errorResponse with data field includes data', () => {
    expect(errorResponse(1, InvalidParams, 'Invalid params', { hint: 'bad' })).toEqual({
      jsonrpc: '2.0',
      id: 1,
      error: { code: -32602, message: 'Invalid params', data: { hint: 'bad' } },
    });
  });

  it('errorResponse without data omits the data field', () => {
    expect(errorResponse(1, InvalidParams, 'Invalid params')).toEqual({
      jsonrpc: '2.0',
      id: 1,
      error: { code: -32602, message: 'Invalid params' },
    });
  });

  it('successResponse encodes result with jsonrpc and id', () => {
    expect(successResponse('a', { ok: true })).toEqual({
      jsonrpc: '2.0',
      id: 'a',
      result: { ok: true },
    });
  });
});

describe('JSON-RPC 2.0 §6 — batch', () => {
  it('rejects an empty batch as invalid-request (with id null)', () => {
    const out = JsonRpcServer.parse('[]');
    expect(out.kind).toBe('invalid-request');
    if (out.kind === 'invalid-request') expect(out.id).toBeNull();
  });

  it('classifies a batch of mixed requests and notifications', () => {
    const out = JsonRpcServer.parse(`[
      {"jsonrpc":"2.0","method":"sum","params":[1,2,4],"id":"1"},
      {"jsonrpc":"2.0","method":"notify_hello","params":[7]},
      {"jsonrpc":"2.0","method":"subtract","params":[42,23],"id":"2"}
    ]`);
    expect(out.kind).toBe('batch');
    if (out.kind === 'batch') {
      expect(out.outcomes.map((o) => o.kind)).toEqual(['request', 'notification', 'request']);
    }
  });

  it('classifies a batch with one invalid element preserved at its position', () => {
    const out = JsonRpcServer.parse('[1,{"jsonrpc":"2.0","method":"foo","id":1}]');
    expect(out.kind).toBe('batch');
    if (out.kind === 'batch') {
      expect(out.outcomes.map((o) => o.kind)).toEqual(['invalid-request', 'request']);
    }
  });

  it('classifies an all-invalid batch as a batch of invalid-request outcomes', () => {
    const out = JsonRpcServer.parse('[1,2,3]');
    expect(out.kind).toBe('batch');
    if (out.kind === 'batch') {
      expect(out.outcomes.every((o) => o.kind === 'invalid-request')).toBe(true);
    }
  });
});

describe('JSON-RPC 2.0 §7 — example transcriptions', () => {
  // §7 named-params request
  it('parses a named-params request', () => {
    const out = JsonRpcServer.parse(
      '{"jsonrpc":"2.0","method":"subtract","params":{"subtrahend":23,"minuend":42},"id":3}',
    );
    expect(out.kind).toBe('request');
    if (out.kind === 'request') {
      expect(out.message.method).toBe('subtract');
      expect(out.message.params).toEqual({ subtrahend: 23, minuend: 42 });
      expect(out.message.id).toBe(3);
    }
  });

  // §7 positional-params request
  it('parses a positional-params request', () => {
    const out = JsonRpcServer.parse(
      '{"jsonrpc":"2.0","method":"subtract","params":[42,23],"id":1}',
    );
    expect(out.kind).toBe('request');
    if (out.kind === 'request') {
      expect(out.message.params).toEqual([42, 23]);
    }
  });

  // §7 invalid JSON example
  it('parses the spec\'s invalid-JSON example as parse-error', () => {
    const out = JsonRpcServer.parse(
      '{"jsonrpc": "2.0", "method": "foobar, "params": "bar", "baz]',
    );
    expect(out.kind).toBe('parse-error');
  });

  // §7 invalid-request example: { "jsonrpc": "2.0", "method": 1, "params": "bar" }
  it('parses the spec\'s invalid-request example as invalid-request', () => {
    const out = JsonRpcServer.parse('{"jsonrpc":"2.0","method":1,"params":"bar"}');
    expect(out.kind).toBe('invalid-request');
  });
});
