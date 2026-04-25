/**
 * Content-addressed idempotency — hash command + inputs + environment
 * fingerprint, look up `.czap/cache/<hash>.json`, return cached receipt
 * if present unless `force` is true.
 *
 * @module
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { CanonicalCbor } from '@czap/core';

/** Context supplied to the idempotency helpers. */
export interface IdempotencyCtx {
  readonly command: string;
  readonly inputs: Record<string, unknown>;
  readonly force: boolean;
}

/** Hash the command + inputs into a short hex slug. */
export function hashInputs(ctx: IdempotencyCtx): string {
  // ADR-0003: feed SHA-256 RFC 8949 canonical CBOR bytes so the slug is
  // invariant under key permutation and JSON stringification quirks.
  const canonical = CanonicalCbor.encode({ command: ctx.command, inputs: ctx.inputs });
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

/** Path where the cached receipt lives (relative to cwd). */
export function cachePath(hash: string): string {
  return join('.czap', 'cache', `${hash}.json`);
}

/** Return a cached receipt for this invocation, or null if absent / forced. */
export function tryReadCache(ctx: IdempotencyCtx): unknown | null {
  if (ctx.force) return null;
  const path = cachePath(hashInputs(ctx));
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

/** Write the fresh receipt to the cache for future identical invocations. */
export function writeCache(ctx: IdempotencyCtx, receipt: unknown): void {
  const path = cachePath(hashInputs(ctx));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(receipt, null, 2), 'utf8');
}
