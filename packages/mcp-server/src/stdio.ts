/**
 * MCP stdio server — reads JSON-RPC 2.0 framed messages line-by-line from
 * stdin, writes responses to stdout. Routes every line through
 * `JsonRpcServer.parse` so parse errors emit -32700 (was silently dropped)
 * and notifications produce no response (§4.1).
 *
 * @module
 */

import { createInterface } from 'node:readline/promises';
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

/** Run the MCP stdio loop until stdin closes. */
export async function runStdio(): Promise<void> {
  const rl = createInterface({ input: process.stdin });
  for await (const line of rl) {
    const wire = await processLine(line);
    if (wire !== null) {
      process.stdout.write(wire + '\n');
    }
  }
}

// Allow direct tsx invocation for integration tests.
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('stdio.ts')) {
  runStdio().catch((err: unknown) => {
    process.stderr.write(JSON.stringify({ error: String(err) }) + '\n');
    process.exit(1);
  });
}
