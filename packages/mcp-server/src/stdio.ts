/**
 * MCP stdio server — reads JSON-RPC 2.0 framed messages line-by-line from
 * stdin, writes responses to stdout. Routes every line through
 * `JsonRpcServer.parse` so parse errors emit -32700 (was silently dropped)
 * and notifications produce no response (§4.1).
 *
 * @module
 */

import { createInterface } from 'node:readline/promises';
import type { Readable, Writable } from 'node:stream';
import { handleRequest } from './http.js';

/**
 * Process a single JSON-RPC stdio line and return the wire payload (a
 * JSON-encoded string) or `null` when no response should be emitted
 * (notification or pure-notification batch). Empty/whitespace-only lines
 * are also `null` so the stdio loop can skip them silently.
 *
 * Exported so unit tests cover the exact line-handling logic without
 * spinning up a child process and pumping stdin.
 */
export async function processLine(line: string): Promise<string | null> {
  if (!line.trim()) return null;
  const response = await handleRequest(line);
  if (response === null) return null;
  return JSON.stringify(response);
}

/**
 * Run the MCP stdio loop until the input stream closes. Defaults to
 * `process.stdin` / `process.stdout` so the production CLI bootstrap
 * stays a one-liner (`runStdio()`); tests inject a pre-populated
 * Readable + a sink Writable to exercise the full read-line-write loop
 * without spawning a child process.
 */
export async function runStdio(
  input: Readable = process.stdin,
  output: Writable = process.stdout,
): Promise<void> {
  const rl = createInterface({ input });
  for await (const line of rl) {
    const wire = await processLine(line);
    if (wire !== null) {
      output.write(wire + '\n');
    }
  }
}

// Side-effect import installs the tsx direct-invoke guard so the integration
// spawn (`tsx packages/mcp-server/src/stdio.ts`) keeps working. Bootstrap
// lives in `./stdio-server.ts` because Windows-spawn coverage can't be
// merged back through c8 ignore (source-mapped TS line numbers don't match).
import './stdio-server.js';
