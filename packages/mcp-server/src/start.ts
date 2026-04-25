/**
 * start — pick an MCP transport. Default is stdio; pass `{ http: ':3838' }`
 * to bind HTTP instead.
 *
 * @module
 */

import { runStdio } from './stdio.js';

/** Options for `start`. */
export interface StartOpts {
  readonly http?: string;
}

/** Start the MCP server on the requested transport. */
export async function start(opts: StartOpts = {}): Promise<void> {
  if (opts.http !== undefined) {
    const { runHttp } = await import('./http.js');
    await runHttp(opts.http);
    return;
  }
  await runStdio();
}
