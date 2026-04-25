/**
 * RFC 8949 §4.2.1 canonical CBOR encoder conformance tests.
 *
 * Vectors taken from RFC 8949 Appendix A (canonical subset). Plus
 * key-order stability and integer-form preference for our content-address
 * use case.
 */

import { describe, it, expect } from 'vitest';
import { CanonicalCbor } from '@czap/core';

describe('CanonicalCbor.encode — RFC 8949 Appendix A vectors', () => {
  it('encodes unsigned integers in shortest form', () => {
    expect(CanonicalCbor.encode(0)).toEqual(new Uint8Array([0x00]));
    expect(CanonicalCbor.encode(1)).toEqual(new Uint8Array([0x01]));
    expect(CanonicalCbor.encode(10)).toEqual(new Uint8Array([0x0a]));
    expect(CanonicalCbor.encode(23)).toEqual(new Uint8Array([0x17]));
    expect(CanonicalCbor.encode(24)).toEqual(new Uint8Array([0x18, 0x18]));
    expect(CanonicalCbor.encode(25)).toEqual(new Uint8Array([0x18, 0x19]));
    expect(CanonicalCbor.encode(100)).toEqual(new Uint8Array([0x18, 0x64]));
    expect(CanonicalCbor.encode(1000)).toEqual(new Uint8Array([0x19, 0x03, 0xe8]));
    expect(CanonicalCbor.encode(1000000)).toEqual(new Uint8Array([0x1a, 0x00, 0x0f, 0x42, 0x40]));
  });

  it('encodes negative integers via -1-n form', () => {
    expect(CanonicalCbor.encode(-1)).toEqual(new Uint8Array([0x20]));
    expect(CanonicalCbor.encode(-10)).toEqual(new Uint8Array([0x29]));
    expect(CanonicalCbor.encode(-100)).toEqual(new Uint8Array([0x38, 0x63]));
    expect(CanonicalCbor.encode(-1000)).toEqual(new Uint8Array([0x39, 0x03, 0xe7]));
  });

  it('encodes 8-byte integer head for values above uint32 range', () => {
    // 1_000_000_000_000 → 0x1b 00 00 00 e8 d4 a5 10 00 (RFC 8949 Appendix A).
    expect(CanonicalCbor.encode(1_000_000_000_000)).toEqual(
      new Uint8Array([0x1b, 0x00, 0x00, 0x00, 0xe8, 0xd4, 0xa5, 0x10, 0x00]),
    );
  });

  it('encodes simple values', () => {
    expect(CanonicalCbor.encode(false)).toEqual(new Uint8Array([0xf4]));
    expect(CanonicalCbor.encode(true)).toEqual(new Uint8Array([0xf5]));
    expect(CanonicalCbor.encode(null)).toEqual(new Uint8Array([0xf6]));
  });

  it('treats undefined as null', () => {
    expect(CanonicalCbor.encode(undefined)).toEqual(new Uint8Array([0xf6]));
  });

  it('encodes UTF-8 strings with length prefix', () => {
    expect(CanonicalCbor.encode('')).toEqual(new Uint8Array([0x60]));
    expect(CanonicalCbor.encode('a')).toEqual(new Uint8Array([0x61, 0x61]));
    expect(CanonicalCbor.encode('IETF')).toEqual(new Uint8Array([0x64, 0x49, 0x45, 0x54, 0x46]));
  });

  it('encodes definite-length arrays', () => {
    expect(CanonicalCbor.encode([])).toEqual(new Uint8Array([0x80]));
    expect(CanonicalCbor.encode([1, 2, 3])).toEqual(new Uint8Array([0x83, 0x01, 0x02, 0x03]));
  });

  it('encodes definite-length maps with sorted keys', () => {
    expect(CanonicalCbor.encode({})).toEqual(new Uint8Array([0xa0]));
    expect(CanonicalCbor.encode({ a: 1, b: [2, 3] })).toEqual(
      new Uint8Array([0xa2, 0x61, 0x61, 0x01, 0x61, 0x62, 0x82, 0x02, 0x03]),
    );
  });

  it('encodes Uint8Array as byte string', () => {
    expect(CanonicalCbor.encode(new Uint8Array([1, 2, 3, 4]))).toEqual(
      new Uint8Array([0x44, 0x01, 0x02, 0x03, 0x04]),
    );
  });
});

describe('CanonicalCbor.encode — canonical determinism', () => {
  it('is key-order stable', () => {
    const a = CanonicalCbor.encode({ a: 1, b: 2, c: 3 });
    const b = CanonicalCbor.encode({ c: 3, a: 1, b: 2 });
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('sorts keys by encoded-byte order, not insertion order', () => {
    // Single-byte 'a' (0x61) sorts before two-byte 'aa' (0x62 0x61 0x61) →
    // RFC 8949 length-then-lex implied via head-byte ordering.
    const out = CanonicalCbor.encode({ aa: 2, a: 1 });
    // Map of two pairs: a(1), aa(2)
    expect(out).toEqual(new Uint8Array([0xa2, 0x61, 0x61, 0x01, 0x62, 0x61, 0x61, 0x02]));
  });

  it('prefers integer form over float for integer-valued numbers', () => {
    expect(CanonicalCbor.encode(1.0)).toEqual(CanonicalCbor.encode(1));
  });

  it('encodes non-integer floats as float64 (major 7 simple 27)', () => {
    const out = CanonicalCbor.encode(1.5);
    expect(out[0]).toBe(0xfb);
    expect(out.length).toBe(9);
  });

  it('encodes NaN and Infinity as float64 with pinned byte patterns', () => {
    // Lock current behavior so content-address payloads stay byte-stable.
    const nan = CanonicalCbor.encode(Number.NaN);
    expect(nan[0]).toBe(0xfb);
    expect(nan.length).toBe(9);
    const posInf = CanonicalCbor.encode(Number.POSITIVE_INFINITY);
    expect(posInf).toEqual(
      new Uint8Array([0xfb, 0x7f, 0xf0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
    );
    const negInf = CanonicalCbor.encode(Number.NEGATIVE_INFINITY);
    expect(negInf).toEqual(
      new Uint8Array([0xfb, 0xff, 0xf0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
    );
  });

  it('skips undefined values in objects (JSON-compatible)', () => {
    const a = CanonicalCbor.encode({ a: 1, b: undefined, c: 3 });
    const b = CanonicalCbor.encode({ a: 1, c: 3 });
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('round-trips identical bytes for nested permuted objects', () => {
    const a = CanonicalCbor.encode({ outer: { x: 1, y: 2 }, name: 'capsule' });
    const b = CanonicalCbor.encode({ name: 'capsule', outer: { y: 2, x: 1 } });
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});
