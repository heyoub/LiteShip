/**
 * JsonRpcServer — framework-free JSON-RPC 2.0 kernel.
 *
 * Parses incoming wire bytes, classifies them as Request | Notification |
 * Batch | InvalidRequest | ParseError, and produces responses (or null
 * for notifications, which MUST NOT receive a response per §4.1).
 *
 * Exposed as a `pureTransform` arm capsule `mcp.jsonrpc-server` so it
 * appears in the manifest and can be reused by future JSON-RPC surfaces
 * beyond MCP.
 *
 * Conformance: JSON-RPC 2.0 specification (https://www.jsonrpc.org/specification).
 *   §3 — `jsonrpc: "2.0"` required.
 *   §4 — Request vs Notification distinguished by presence of `id`.
 *   §4.1 — A Notification MUST NOT receive a Response.
 *   §4.2 — Parse errors MUST emit a Response with code -32700, id null.
 *   §5 — Response is `result` XOR `error`.
 *   §5.1 — Standard error codes.
 *   §6 — Batch: array of requests/notifications. Empty array → -32600.
 *
 * @module
 */

import { Schema } from 'effect';
import { defineCapsule } from '@czap/core';

// ---------- JSON-RPC 2.0 types (wire-shape) ----------

/** Per §4: `id` is string, number, or null. Absent = notification. */
export type JsonRpcId = string | number | null;

/** A JSON-RPC 2.0 request (has `id`). */
export interface JsonRpcRequest {
  readonly jsonrpc: '2.0';
  readonly id: JsonRpcId;
  readonly method: string;
  readonly params?: readonly unknown[] | Record<string, unknown>;
}

/** A JSON-RPC 2.0 notification (no `id`). Per §4.1 MUST NOT be responded to. */
export interface JsonRpcNotification {
  readonly jsonrpc: '2.0';
  readonly method: string;
  readonly params?: readonly unknown[] | Record<string, unknown>;
}

/** Successful response per §5. */
export interface JsonRpcSuccess {
  readonly jsonrpc: '2.0';
  readonly id: JsonRpcId;
  readonly result: unknown;
}

/** Error response per §5 + §5.1. */
export interface JsonRpcErrorResponse {
  readonly jsonrpc: '2.0';
  readonly id: JsonRpcId;
  readonly error: { readonly code: number; readonly message: string; readonly data?: unknown };
}

/** Either a success or error response. */
export type JsonRpcResponse = JsonRpcSuccess | JsonRpcErrorResponse;

// ---------- Standard error codes (§5.1) ----------

export const ParseError = -32700 as const;
export const InvalidRequest = -32600 as const;
export const MethodNotFound = -32601 as const;
export const InvalidParams = -32602 as const;
export const InternalError = -32603 as const;

// ---------- Parser output classification ----------

/** Discriminated union of every parse outcome the kernel produces. */
export type ParseOutcome =
  | { readonly kind: 'request'; readonly message: JsonRpcRequest }
  | { readonly kind: 'notification'; readonly message: JsonRpcNotification }
  | { readonly kind: 'batch'; readonly outcomes: readonly ParseOutcome[] }
  | { readonly kind: 'parse-error' }
  | { readonly kind: 'invalid-request'; readonly id: JsonRpcId };

/**
 * Parse a single JSON-RPC line. Distinguishes:
 * - parse failure → `parse-error` (§4.2)
 * - empty array → `invalid-request` per §6
 * - non-object scalar → `invalid-request`
 * - object with bad `jsonrpc`/`method` → `invalid-request`
 * - object with `id` present → `request`
 * - object without `id` → `notification`
 * - non-empty array → `batch` with per-element outcomes
 *
 * Note (§4 id-vs-notification): `"id": null` is a Request with id null,
 * not a notification. Only an absent id field marks a notification.
 */
function _parse(line: string): ParseOutcome {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return { kind: 'parse-error' };
  }
  if (Array.isArray(raw)) {
    if (raw.length === 0) return { kind: 'invalid-request', id: null };
    return { kind: 'batch', outcomes: raw.map(_classify) };
  }
  return _classify(raw);
}

function _classify(raw: unknown): ParseOutcome {
  if (typeof raw !== 'object' || raw === null) {
    return { kind: 'invalid-request', id: null };
  }
  const obj = raw as Record<string, unknown>;
  if (obj.jsonrpc !== '2.0' || typeof obj.method !== 'string') {
    const id =
      typeof obj.id === 'string' || typeof obj.id === 'number' || obj.id === null
        ? (obj.id as JsonRpcId)
        : null;
    return { kind: 'invalid-request', id };
  }
  if (!('id' in obj) || obj.id === undefined) {
    return { kind: 'notification', message: obj as unknown as JsonRpcNotification };
  }
  return { kind: 'request', message: obj as unknown as JsonRpcRequest };
}

/** Construct a -32700 / -32600 / -32601 / -32602 / -32603 error response. */
function _errorResponse(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcErrorResponse {
  return data !== undefined
    ? { jsonrpc: '2.0', id, error: { code, message, data } }
    : { jsonrpc: '2.0', id, error: { code, message } };
}

/** Construct a success response (§5). */
function _successResponse(id: JsonRpcId, result: unknown): JsonRpcSuccess {
  return { jsonrpc: '2.0', id, result };
}

// Re-export pure functions for direct import sites.
export const parse = _parse;
export const errorResponse = _errorResponse;
export const successResponse = _successResponse;

// ---------- Capsule declaration (pureTransform arm) ----------
//
// Schemas are deliberately structural: the harness uses them to drive
// `Schema.decodeUnknownEffect` against `fc.anything()` inputs, so we
// only need to express enough shape for it to filter the property test.
const JsonRpcInputSchema = Schema.String;
const ParseOutcomeKindSchema = Schema.Union([
  Schema.Literal('request'),
  Schema.Literal('notification'),
  Schema.Literal('batch'),
  Schema.Literal('parse-error'),
  Schema.Literal('invalid-request'),
]);
const ParseOutcomeSchema = Schema.Struct({ kind: ParseOutcomeKindSchema });

/**
 * Capsule definition for the kernel — placed in the catalog under the
 * `pureTransform` arm so the factory compiler emits a generated test +
 * bench pair and the manifest tracks the kernel's content address.
 */
export const jsonRpcServerCapsule = defineCapsule({
  _kind: 'pureTransform',
  name: 'mcp.jsonrpc-server',
  site: ['node', 'browser'],
  capabilities: { reads: [], writes: [] },
  input: JsonRpcInputSchema,
  output: ParseOutcomeSchema,
  budgets: { p95Ms: 1, allocClass: 'bounded' },
  invariants: [
    {
      name: 'malformed-json-yields-parse-error',
      check: (input: string, _output): boolean => {
        // Behavioral invariant: an input that is NOT valid JSON MUST be
        // classified as parse-error. The TS union proves syntactic
        // shape; this proves the parser actually rejects bad input.
        try {
          JSON.parse(input);
          return true; // valid JSON — not the negative case we're testing
        } catch {
          return _parse(input).kind === 'parse-error';
        }
      },
      message: 'inputs that JSON.parse rejects must yield kind: parse-error',
    },
    {
      name: 'absent-id-classifies-as-notification',
      check: (input: string, _output): boolean => {
        // Behavioral invariant: a well-formed object with jsonrpc:'2.0'
        // and method:string but NO id field MUST be a notification, not
        // a request. This is the §4.1 distinction the strike force flagged.
        let obj: unknown;
        try { obj = JSON.parse(input); } catch { return true; }
        if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return true;
        const o = obj as Record<string, unknown>;
        if (o.jsonrpc !== '2.0' || typeof o.method !== 'string') return true;
        if ('id' in o && o.id !== undefined) return true; // request, not the test case
        return _parse(input).kind === 'notification';
      },
      message: 'well-formed messages without an id field must classify as notifications (§4.1)',
    },
  ],
});

// ---------- Namespace surface (ADR-0001) ----------

/** Namespaced public surface of the kernel. */
export const JsonRpcServer = {
  parse: _parse,
  errorResponse: _errorResponse,
  successResponse: _successResponse,
} as const;

export declare namespace JsonRpcServer {
  /** Discriminated parse outcome. */
  export type Outcome = ParseOutcome;
  /** Wire-shape request (§4). */
  export type Request = JsonRpcRequest;
  /** Wire-shape notification (§4.1). */
  export type Notification = JsonRpcNotification;
  /** Wire-shape response (§5). */
  export type Response = JsonRpcResponse;
  /** Wire-shape success response. */
  export type Success = JsonRpcSuccess;
  /** Wire-shape error response. */
  export type Error = JsonRpcErrorResponse;
  /** Id type per §4. */
  export type Id = JsonRpcId;
}
