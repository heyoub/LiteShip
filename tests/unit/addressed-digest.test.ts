/**
 * AddressedDigest -- dual hash (fnv1a display_id + sha256 integrity_digest)
 * over the same canonical bytes (ADR-0011 §Decision item 2).
 */

import { describe, it, expect } from 'vitest';
import { Effect } from 'effect';
import { AddressedDigest } from '@czap/core';

const run = <A, E>(eff: Effect.Effect<A, E>) => Effect.runPromise(eff);

const FNV_RE = /^fnv1a:[0-9a-f]{8}$/;
const SHA_RE = /^sha256:[0-9a-f]{64}$/;

describe('AddressedDigest.of', () => {
  it('produces a display_id matching fnv1a:XXXXXXXX', async () => {
    const d = await run(AddressedDigest.of(new Uint8Array([1, 2, 3, 4, 5])));
    expect(d.display_id).toMatch(FNV_RE);
  });

  it('produces an integrity_digest matching sha256:<64-hex>', async () => {
    const d = await run(AddressedDigest.of(new Uint8Array([1, 2, 3, 4, 5])));
    expect(d.integrity_digest).toMatch(SHA_RE);
  });

  it('algo defaults to sha256', async () => {
    const d = await run(AddressedDigest.of(new Uint8Array([0])));
    expect(d.algo).toBe('sha256');
  });

  it('same bytes → identical display_id AND identical integrity_digest', async () => {
    const a = await run(AddressedDigest.of(new Uint8Array([9, 8, 7, 6, 5])));
    const b = await run(AddressedDigest.of(new Uint8Array([9, 8, 7, 6, 5])));
    expect(a.display_id).toBe(b.display_id);
    expect(a.integrity_digest).toBe(b.integrity_digest);
    expect(a.algo).toBe(b.algo);
  });

  it('differing-by-one-byte inputs → both digests differ', async () => {
    const a = await run(AddressedDigest.of(new Uint8Array([1, 2, 3, 4])));
    const b = await run(AddressedDigest.of(new Uint8Array([1, 2, 3, 5])));
    expect(a.display_id).not.toBe(b.display_id);
    expect(a.integrity_digest).not.toBe(b.integrity_digest);
  });

  it('empty input still yields valid display_id and integrity_digest', async () => {
    const d = await run(AddressedDigest.of(new Uint8Array(0)));
    expect(d.display_id).toMatch(FNV_RE);
    expect(d.integrity_digest).toMatch(SHA_RE);
  });

  it('algo=blake3 fails with a clear "not yet implemented" Error mentioning blake3', async () => {
    const exit = await Effect.runPromiseExit(AddressedDigest.of(new Uint8Array([1, 2, 3]), 'blake3'));
    expect(exit._tag).toBe('Failure');
    if (exit._tag !== 'Failure') return;
    // Walk the cause to find the Error
    const err = await Effect.runPromise(
      AddressedDigest.of(new Uint8Array([1, 2, 3]), 'blake3').pipe(Effect.flip),
    );
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain('blake3');
  });
});
