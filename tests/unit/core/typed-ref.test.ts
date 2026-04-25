/**
 * TypedRef -- content-addressed payload references: canonicalize, hash, create, equals.
 */

import { afterEach, describe, test, expect, vi } from 'vitest';
import { Effect } from 'effect';
import { TypedRef } from '@czap/core';

const run = <A>(effect: Effect.Effect<A>): Promise<A> => Effect.runPromise(effect);

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// canonicalize
// ---------------------------------------------------------------------------

describe('TypedRef.canonicalize', () => {
  test('returns Uint8Array', () => {
    const result = TypedRef.canonicalize({ a: 1 });
    expect(result).toBeInstanceOf(Uint8Array);
  });

  test('deterministic -- same input produces same bytes', () => {
    const a = TypedRef.canonicalize({ x: 'hello', y: 42 });
    const b = TypedRef.canonicalize({ x: 'hello', y: 42 });
    expect(a).toEqual(b);
  });

  test('CBOR canonical form -- key order is stable', () => {
    // CBOR canonical encoding sorts keys by length then lexicographically
    const a = TypedRef.canonicalize({ b: 2, a: 1 });
    const b = TypedRef.canonicalize({ a: 1, b: 2 });
    expect(a).toEqual(b);
  });

  test('different values produce different bytes', () => {
    const a = TypedRef.canonicalize({ value: 1 });
    const b = TypedRef.canonicalize({ value: 2 });
    expect(a).not.toEqual(b);
  });

  test('handles nested objects', () => {
    const result = TypedRef.canonicalize({ nested: { deep: [1, 2, 3] } });
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(0);
  });

  test('handles primitives', () => {
    expect(TypedRef.canonicalize(42)).toBeInstanceOf(Uint8Array);
    expect(TypedRef.canonicalize('hello')).toBeInstanceOf(Uint8Array);
    expect(TypedRef.canonicalize(true)).toBeInstanceOf(Uint8Array);
    expect(TypedRef.canonicalize(null)).toBeInstanceOf(Uint8Array);
  });
});

// ---------------------------------------------------------------------------
// hash
// ---------------------------------------------------------------------------

describe('TypedRef.hash', () => {
  test('returns sha256: prefixed hex string from string input', async () => {
    const h = await run(TypedRef.hash('hello'));
    expect(h).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  test('returns sha256: prefixed hex string from Uint8Array input', async () => {
    const bytes = new TextEncoder().encode('hello');
    const h = await run(TypedRef.hash(bytes));
    expect(h).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  test('deterministic -- same input produces same hash', async () => {
    const a = await run(TypedRef.hash('test-data'));
    const b = await run(TypedRef.hash('test-data'));
    expect(a).toBe(b);
  });

  test('different inputs produce different hashes', async () => {
    const a = await run(TypedRef.hash('data-a'));
    const b = await run(TypedRef.hash('data-b'));
    expect(a).not.toBe(b);
  });

  test('string and equivalent Uint8Array produce same hash', async () => {
    const str = 'hello world';
    const bytes = new TextEncoder().encode(str);
    const fromStr = await run(TypedRef.hash(str));
    const fromBytes = await run(TypedRef.hash(bytes));
    expect(fromStr).toBe(fromBytes);
  });

  test('wraps Error rejections from crypto.subtle.digest with the original message', async () => {
    vi.spyOn(crypto.subtle, 'digest').mockRejectedValueOnce(new Error('digest exploded'));

    await expect(run(TypedRef.hash('boom'))).rejects.toThrow('SHA-256 hash failed: digest exploded');
  });

  test('wraps non-Error rejections from crypto.subtle.digest using string coercion', async () => {
    vi.spyOn(crypto.subtle, 'digest').mockRejectedValueOnce('digest exploded');

    await expect(run(TypedRef.hash('boom'))).rejects.toThrow('SHA-256 hash failed: digest exploded');
  });
});

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

describe('TypedRef.create', () => {
  test('produces shape with schema_hash and content_hash', async () => {
    const ref = await run(TypedRef.create('schema-v1', { name: 'test' }));
    expect(ref).toHaveProperty('schema_hash');
    expect(ref).toHaveProperty('content_hash');
    expect(ref.schema_hash).toBe('schema-v1');
    expect(ref.content_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  test('same schema + payload produces same content_hash', async () => {
    const a = await run(TypedRef.create('s1', { val: 100 }));
    const b = await run(TypedRef.create('s1', { val: 100 }));
    expect(a.content_hash).toBe(b.content_hash);
  });

  test('different payload produces different content_hash', async () => {
    const a = await run(TypedRef.create('s1', { val: 1 }));
    const b = await run(TypedRef.create('s1', { val: 2 }));
    expect(a.content_hash).not.toBe(b.content_hash);
  });

  test('different schema_hash does not affect content_hash', async () => {
    // content_hash is derived from payload canonicalization, schema_hash is stored as-is
    const a = await run(TypedRef.create('schema-a', { x: 1 }));
    const b = await run(TypedRef.create('schema-b', { x: 1 }));
    expect(a.content_hash).toBe(b.content_hash);
    expect(a.schema_hash).not.toBe(b.schema_hash);
  });
});

// ---------------------------------------------------------------------------
// equals
// ---------------------------------------------------------------------------

describe('TypedRef.equals', () => {
  test('same refs are equal', async () => {
    const ref = await run(TypedRef.create('s1', { data: 'test' }));
    expect(TypedRef.equals(ref, ref)).toBe(true);
  });

  test('identical refs from separate creates are equal', async () => {
    const a = await run(TypedRef.create('s1', { data: 'test' }));
    const b = await run(TypedRef.create('s1', { data: 'test' }));
    expect(TypedRef.equals(a, b)).toBe(true);
  });

  test('different content_hash refs are not equal', async () => {
    const a = await run(TypedRef.create('s1', { data: 'a' }));
    const b = await run(TypedRef.create('s1', { data: 'b' }));
    expect(TypedRef.equals(a, b)).toBe(false);
  });

  test('different schema_hash refs are not equal', async () => {
    const a = await run(TypedRef.create('s1', { data: 'x' }));
    const b = await run(TypedRef.create('s2', { data: 'x' }));
    expect(TypedRef.equals(a, b)).toBe(false);
  });

  test('works with manually constructed shapes', () => {
    const a = { schema_hash: 'a', content_hash: 'sha256:abc' };
    const b = { schema_hash: 'a', content_hash: 'sha256:abc' };
    const c = { schema_hash: 'a', content_hash: 'sha256:def' };
    expect(TypedRef.equals(a, b)).toBe(true);
    expect(TypedRef.equals(a, c)).toBe(false);
  });
});
