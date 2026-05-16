/**
 * version — print czap, Node, and pnpm versions. Emits a JSON receipt
 * to stdout; pretty TTY summary to stderr when attached.
 *
 * @module
 */

import { spawnArgvCapture } from '../lib/spawn.js';
import { emit } from '../receipts.js';
import { readCliVersion } from './doctor.js';

/** Receipt shape emitted by `czap version`. */
export interface VersionReceipt {
  readonly status: 'ok';
  readonly command: 'version';
  readonly timestamp: string;
  readonly czap: string;
  readonly node: string;
  readonly pnpm: string | null;
}

async function probePnpmVersion(): Promise<string | null> {
  const r = await spawnArgvCapture('pnpm', ['--version']).catch(() => null);
  if (!r || r.exitCode !== 0) return null;
  return r.stdout.trim() || null;
}

/** Execute the version command. */
export async function version(opts: { pretty?: boolean; cwd?: string } = {}): Promise<number> {
  const receipt: VersionReceipt = {
    status: 'ok',
    command: 'version',
    timestamp: new Date().toISOString(),
    czap: readCliVersion(opts.cwd),
    node: process.versions.node,
    pnpm: await probePnpmVersion(),
  };
  emit(receipt);

  const wantPretty = opts.pretty ?? Boolean(process.stderr.isTTY);
  if (wantPretty) {
    process.stderr.write(`czap ${receipt.czap}  (Node ${receipt.node}, pnpm ${receipt.pnpm ?? 'not found'})\n`);
  }

  return 0;
}
