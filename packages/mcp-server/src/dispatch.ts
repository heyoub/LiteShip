/**
 * MCP tool dispatch — maps tools/call params to czap CLI command
 * executions. Captures CLI stdout and returns it as MCP text content.
 *
 * Entry point `dispatch` accepts a typed JSON-RPC `Request | Notification`
 * (post-`JsonRpcServer.parse` classification) and produces a
 * `JsonRpcResponse | null`. `null` is returned for notifications: per
 * JSON-RPC 2.0 §4.1 the server MUST NOT send a response for them.
 *
 * `dispatchToolCall` remains exported for tests that exercise the CLI
 * dispatch path directly without going through the JSON-RPC envelope.
 *
 * @module
 */

import {
  type JsonRpcNotification,
  type JsonRpcRequest,
  type JsonRpcResponse,
  errorResponse,
  successResponse,
  MethodNotFound,
  InvalidParams,
  InternalError,
} from './jsonrpc.js';

/**
 * Sentinel for invalid-params throws inside method invocations. Caught
 * by `dispatch` and mapped to JSON-RPC 2.0 §5.1 code -32602 (the spec
 * code for malformed parameters). Generic `Error`s remain -32603
 * (Internal error).
 */
class InvalidParamsError extends Error {
  constructor(
    message: string,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = 'InvalidParamsError';
  }
}

type RunFn = (argv: readonly string[]) => Promise<number>;

let cachedRun: RunFn | undefined;

/** Lazy-load `@czap/cli` so `@czap/mcp-server` does not declare a package dependency cycle. */
async function getRun(): Promise<RunFn> {
  if (!cachedRun) {
    const mod = await import('@czap/cli');
    cachedRun = mod.run;
  }
  return cachedRun;
}

/** Shape of an MCP tools/call parameter object. */
export interface McpToolCall {
  readonly name: string;
  readonly arguments: Record<string, unknown>;
}

/** MCP tools/call result envelope. */
export interface McpToolResult {
  readonly content: ReadonlyArray<{ type: 'text'; text: string }>;
  readonly isError: boolean;
}

/**
 * Route a parsed JSON-RPC message to its method handler.
 *
 * Returns `null` for notifications (§4.1: notifications MUST NOT receive
 * a response). For requests, returns either a success or an error
 * response. Internal handler exceptions are caught and surfaced as
 * `-32603 Internal error` per §5.1.
 */
export async function dispatch(msg: JsonRpcRequest | JsonRpcNotification): Promise<JsonRpcResponse | null> {
  const isNotification = !('id' in msg);
  const id = isNotification ? null : (msg as JsonRpcRequest).id;

  try {
    const result = await invoke(msg);
    if (isNotification) return null;
    if (result.kind === 'method-not-found') {
      return errorResponse(id, MethodNotFound, 'method not found', { method: msg.method });
    }
    return successResponse(id, result.value);
  } catch (err) {
    if (isNotification) {
      const notificationAck: null = null;
      return notificationAck;
    }
    if (err instanceof InvalidParamsError) {
      return errorResponse(id, InvalidParams, err.message, err.detail);
    }
    return errorResponse(id, InternalError, 'Internal error', { detail: String(err) });
  }
}

/** Internal: dispatch result shape. */
type InvokeResult = { readonly kind: 'ok'; readonly value: unknown } | { readonly kind: 'method-not-found' };

function ok(value: unknown): InvokeResult {
  return { kind: 'ok', value };
}

async function invoke(msg: JsonRpcRequest | JsonRpcNotification): Promise<InvokeResult> {
  switch (msg.method) {
    case 'tools/list':
      return ok({ tools: listTools() });
    case 'tools/call': {
      const params = msg.params as { name: string; arguments: Record<string, unknown> } | undefined;
      if (!params || typeof params.name !== 'string') {
        // Per §5.1, malformed params → -32602. InvalidParamsError sentinel
        // is mapped to InvalidParams in dispatch's catch block.
        throw new InvalidParamsError('tools/call requires { name: string, arguments: object }', { received: params });
      }
      const result = await dispatchToolCall(params);
      return ok(result);
    }
    default:
      return { kind: 'method-not-found' };
  }
}

/** Translate a tools/call into argv, run the CLI, capture stdout. */
export async function dispatchToolCall(call: McpToolCall): Promise<McpToolResult> {
  const args = buildArgv(call);
  const originalWrite = process.stdout.write.bind(process.stdout);
  let captured = '';
  (process.stdout as unknown as { write: unknown }).write = (chunk: string | Uint8Array) => {
    captured += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString();
    return true;
  };
  try {
    const run = await getRun();
    const code = await run(args);
    return {
      content: [{ type: 'text', text: captured.trim() }],
      isError: code !== 0,
    };
  } finally {
    (process.stdout as unknown as { write: typeof originalWrite }).write = originalWrite;
  }
}

function buildArgv(call: McpToolCall): string[] {
  const segments = call.name.split('.');
  const args: string[] = [];
  for (const [k, v] of Object.entries(call.arguments)) {
    if (typeof v === 'boolean') {
      if (v) args.push(`--${k}`);
    } else {
      args.push(`--${k}=${String(v)}`);
    }
  }
  return [...segments, ...args];
}

/** Static list of MCP tools produced by czap's CLI. */
export function listTools(): ReadonlyArray<{ name: string; description: string; inputSchema: object }> {
  return [
    {
      name: 'describe',
      description: 'Dump capsule catalog schema',
      inputSchema: { type: 'object', properties: { format: { type: 'string', enum: ['json', 'mcp'] } } },
    },
    {
      name: 'scene.compile',
      description: 'Compile a scene capsule',
      inputSchema: { type: 'object', required: ['scene'], properties: { scene: { type: 'string' } } },
    },
    {
      name: 'scene.render',
      description: 'Render scene to mp4',
      inputSchema: {
        type: 'object',
        required: ['scene', 'output'],
        properties: { scene: { type: 'string' }, output: { type: 'string' } },
      },
    },
    {
      name: 'scene.verify',
      description: 'Run scene generated tests',
      inputSchema: { type: 'object', required: ['scene'], properties: { scene: { type: 'string' } } },
    },
    {
      name: 'asset.analyze',
      description: 'Run cachedProjection on asset',
      inputSchema: {
        type: 'object',
        required: ['asset', 'projection'],
        properties: { asset: { type: 'string' }, projection: { type: 'string', enum: ['beat', 'onset', 'waveform'] } },
      },
    },
    {
      name: 'asset.verify',
      description: 'Verify asset capsule',
      inputSchema: { type: 'object', required: ['asset'], properties: { asset: { type: 'string' } } },
    },
    {
      name: 'capsule.inspect',
      description: 'Inspect a capsule manifest entry',
      inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
    },
    {
      name: 'capsule.verify',
      description: 'Verify capsule generated tests',
      inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
    },
    {
      name: 'capsule.list',
      description: 'List capsules filtered by kind',
      inputSchema: { type: 'object', properties: { kind: { type: 'string' } } },
    },
    {
      name: 'gauntlet',
      description: 'Run the full gauntlet',
      inputSchema: { type: 'object', properties: { 'dry-run': { type: 'boolean' } } },
    },
  ];
}
