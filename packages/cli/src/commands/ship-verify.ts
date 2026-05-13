/**
 * `czap verify <tarball> --capsule <file>` — ADR-0011 local verifier.
 *
 * Pure closed loop: read both files, decode the capsule, recompute the
 * `tarball_manifest_address`, compare. No network, no `pnpm`, no git,
 * no registry. Four verdicts, four exit codes:
 *
 *   - `Verified` (0): both `display_id` and `integrity_digest` of the
 *     recomputed tarball manifest match the capsule.
 *   - `Mismatch` (2): capsule was decoded cleanly but the tarball
 *     disagrees.
 *   - `Incomplete` (3): capsule failed canonical-CBOR decode (malformed,
 *     non-canonical, or wrong shape).
 *   - `Unknown` (4): no capsule supplied. Honest software: we cannot
 *     tell you.
 *
 * @module
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Cause, Effect, Result } from 'effect';
import { ShipCapsule, tarballManifestAddress, type ContentAddress } from '@czap/core';
import { emit, emitError } from '../receipts.js';
import type { ShipVerifyChecks, ShipVerifyReceipt } from '../receipts.js';

interface EffectOk<A> { readonly ok: true; readonly value: A }
interface EffectErr<E> { readonly ok: false; readonly error: E }
type EffectResult<A, E> = EffectOk<A> | EffectErr<E>;

async function runEffect<A, E>(effect: Effect.Effect<A, E>): Promise<EffectResult<A, E>> {
  const exit = await Effect.runPromiseExit(effect);
  if (exit._tag === 'Success') return { ok: true, value: exit.value };
  const found = Cause.findError(exit.cause);
  if (Result.isSuccess(found)) return { ok: false, error: Result.getOrThrow(found) as E };
  // Defect fallback — see ship.ts for the matching rationale.
  return { ok: false, error: new Error(Cause.prettyErrors(exit.cause).map((e) => e.message).join('; ')) as unknown as E };
}

const TIMESTAMP = (): string => new Date().toISOString();

const SKIPPED_CHECKS_BASE = {
  lockfile: 'skipped',
  workspace_manifest: 'skipped',
  chain_link: 'skipped',
} as const satisfies Omit<ShipVerifyChecks, 'tarball_manifest'>;

interface ParsedVerifyArgs {
  readonly tarball: string | undefined;
  readonly capsule: string | undefined;
}

function parseArgs(args: readonly string[]): ParsedVerifyArgs {
  let tarball: string | undefined;
  let capsule: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === '--capsule') {
      const next = args[i + 1];
      if (next !== undefined) {
        capsule = next;
        i++;
      }
      continue;
    }
    if (a.startsWith('--capsule=')) {
      capsule = a.slice('--capsule='.length);
      continue;
    }
    if (!a.startsWith('-') && tarball === undefined) {
      tarball = a;
    }
  }
  return { tarball, capsule };
}

const emitReceipt = (
  tarball: string,
  capsuleId: ContentAddress | null,
  verdict: ShipVerifyReceipt['verdict'],
  checks: ShipVerifyChecks,
  mismatches: readonly string[],
): void => {
  const receipt: ShipVerifyReceipt = {
    status: verdict === 'Verified' ? 'ok' : 'failed',
    command: 'verify',
    timestamp: TIMESTAMP(),
    verdict,
    tarball,
    capsule_id: capsuleId,
    checks,
    mismatches,
  };
  emit(receipt);
};

/** Execute the verify command. */
export async function verify(args: readonly string[]): Promise<number> {
  const parsed = parseArgs(args);
  const tarballPath = parsed.tarball ?? '';

  // Unknown — no capsule supplied. Doctrinally correct: we cannot tell.
  if (parsed.capsule === undefined) {
    emitReceipt(
      tarballPath,
      null,
      'Unknown',
      { tarball_manifest: 'skipped', ...SKIPPED_CHECKS_BASE },
      [],
    );
    return 4;
  }

  if (parsed.tarball === undefined) {
    emitError('verify', 'missing positional <tarball>');
    return 1;
  }

  const tarballAbs = resolve(tarballPath);
  const capsuleAbs = resolve(parsed.capsule);
  if (!existsSync(tarballAbs)) {
    emitError('verify', `tarball not found: ${tarballPath}`);
    return 1;
  }
  if (!existsSync(capsuleAbs)) {
    emitError('verify', `capsule not found: ${parsed.capsule}`);
    return 1;
  }

  const tarballBytes = new Uint8Array(readFileSync(tarballAbs));
  const capsuleBytes = new Uint8Array(readFileSync(capsuleAbs));

  const decoded = await runEffect(ShipCapsule.decode(capsuleBytes));
  if (!decoded.ok) {
    // All three decode errors collapse to Incomplete per ADR-0011 §Decision.
    emitReceipt(
      tarballPath,
      null,
      'Incomplete',
      { tarball_manifest: 'skipped', ...SKIPPED_CHECKS_BASE },
      [`decode:${decoded.error}`],
    );
    return 3;
  }
  const capsule = decoded.value;

  const recomputed = await runEffect(tarballManifestAddress(tarballBytes));
  if (!recomputed.ok) {
    emitReceipt(
      tarballPath,
      capsule.id,
      'Incomplete',
      { tarball_manifest: 'skipped', ...SKIPPED_CHECKS_BASE },
      [`recompute:${recomputed.error.message}`],
    );
    return 3;
  }

  const claimed = capsule.tarball_manifest_address;
  const mismatches: string[] = [];
  if (recomputed.value.display_id !== claimed.display_id) {
    mismatches.push('tarball_manifest_address.display_id');
  }
  if (recomputed.value.integrity_digest !== claimed.integrity_digest) {
    mismatches.push('tarball_manifest_address.integrity_digest');
  }

  if (mismatches.length > 0) {
    emitReceipt(
      tarballPath,
      capsule.id,
      'Mismatch',
      { tarball_manifest: 'mismatch', ...SKIPPED_CHECKS_BASE },
      mismatches,
    );
    return 2;
  }

  emitReceipt(
    tarballPath,
    capsule.id,
    'Verified',
    { tarball_manifest: 'match', ...SKIPPED_CHECKS_BASE },
    [],
  );
  return 0;
}
