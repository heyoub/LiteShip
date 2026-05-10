/** `@czap/mcp-server` — MCP bridge for **LiteShip**; forwards tools to the `czap` CLI + capsule factory. */

export { start } from './start.js';
export type { StartOpts } from './start.js';
export { listTools, dispatchToolCall, dispatch } from './dispatch.js';
export type { McpToolCall, McpToolResult } from './dispatch.js';
export { runStdio } from './stdio.js';
export { runHttp } from './http.js';

// JSON-RPC 2.0 kernel — reusable beyond MCP.
export {
  JsonRpcServer,
  jsonRpcServerCapsule,
  parse,
  errorResponse,
  successResponse,
  ParseError,
  InvalidRequest,
  MethodNotFound,
  InvalidParams,
  InternalError,
} from './jsonrpc.js';
export type {
  JsonRpcId,
  JsonRpcRequest,
  JsonRpcNotification,
  JsonRpcResponse,
  JsonRpcSuccess,
  JsonRpcErrorResponse,
  ParseOutcome,
} from './jsonrpc.js';
