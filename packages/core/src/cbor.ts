/**
 * Canonical CBOR encoder — RFC 8949 §4.2.1 deterministic encoding.
 *
 * Pure encode-only path used to produce stable byte sequences for content
 * addressing and idempotency hashes. Honors ADR-0003: identical inputs
 * (including key-permuted plain objects) emit byte-identical Uint8Arrays
 * across platforms.
 *
 * Rules implemented:
 * - Integers (major 0/1) use shortest form. Range: [MIN_SAFE_INTEGER,
 *   MAX_SAFE_INTEGER]. Negative `n` encodes as `-1 - n` per spec.
 * - Numbers that are not safe integers encode as float64 (major 7, simple 27).
 * - Strings encode as UTF-8 with major 3 length prefix.
 * - Uint8Array encodes as major 2 (byte string) with length prefix.
 * - Arrays encode definite-length (major 4).
 * - Plain objects encode as definite-length maps (major 5). Keys are
 *   sorted by their **encoded byte order** (lex on UTF-8 bytes for the
 *   string-keyed case) before emission. `undefined` properties are skipped.
 * - `false`/`true`/`null` emit simple values 20/21/22. `undefined` is
 *   coerced to null (22) for JSON parity; plain-object properties whose
 *   value is `undefined` are skipped entirely.
 *
 * @module
 */

const MAJOR_UNSIGNED = 0 << 5;
const MAJOR_NEGATIVE = 1 << 5;
const MAJOR_BYTES = 2 << 5;
const MAJOR_STRING = 3 << 5;
const MAJOR_ARRAY = 4 << 5;
const MAJOR_MAP = 5 << 5;
const MAJOR_SIMPLE = 7 << 5;

const SIMPLE_FALSE = 20;
const SIMPLE_TRUE = 21;
const SIMPLE_NULL = 22;
const SIMPLE_FLOAT64 = 27;

const textEncoder = new TextEncoder();

/** Internal: encode an unsigned integer head with the given major type. */
function encodeHead(major: number, value: number): Uint8Array {
  if (value < 0 || !Number.isFinite(value)) {
    throw new RangeError(`CanonicalCbor: head argument must be a non-negative finite integer, got ${value}`);
  }
  if (value < 24) {
    return new Uint8Array([major | value]);
  }
  if (value < 0x100) {
    return new Uint8Array([major | 24, value]);
  }
  if (value < 0x10000) {
    return new Uint8Array([major | 25, (value >>> 8) & 0xff, value & 0xff]);
  }
  if (value < 0x100000000) {
    return new Uint8Array([
      major | 26,
      (value >>> 24) & 0xff,
      (value >>> 16) & 0xff,
      (value >>> 8) & 0xff,
      value & 0xff,
    ]);
  }
  // 8-byte unsigned integer head; safe up to 2^53 - 1.
  const high = Math.floor(value / 0x100000000);
  const low = value >>> 0;
  return new Uint8Array([
    major | 27,
    (high >>> 24) & 0xff,
    (high >>> 16) & 0xff,
    (high >>> 8) & 0xff,
    high & 0xff,
    (low >>> 24) & 0xff,
    (low >>> 16) & 0xff,
    (low >>> 8) & 0xff,
    low & 0xff,
  ]);
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

function encodeInteger(value: number): Uint8Array {
  if (value >= 0) {
    return encodeHead(MAJOR_UNSIGNED, value);
  }
  // -1 - n form. For value = -1 → 0; value = -100 → 99; etc.
  return encodeHead(MAJOR_NEGATIVE, -1 - value);
}

function encodeFloat64(value: number): Uint8Array {
  const buf = new ArrayBuffer(8);
  new DataView(buf).setFloat64(0, value, false /* big-endian */);
  const out = new Uint8Array(9);
  out[0] = MAJOR_SIMPLE | SIMPLE_FLOAT64;
  out.set(new Uint8Array(buf), 1);
  return out;
}

function encodeNumber(value: number): Uint8Array {
  if (
    Number.isInteger(value) &&
    value >= Number.MIN_SAFE_INTEGER &&
    value <= Number.MAX_SAFE_INTEGER
  ) {
    return encodeInteger(value);
  }
  return encodeFloat64(value);
}

function encodeString(value: string): Uint8Array {
  const utf8 = textEncoder.encode(value);
  return concat([encodeHead(MAJOR_STRING, utf8.length), utf8]);
}

function encodeBytes(value: Uint8Array): Uint8Array {
  return concat([encodeHead(MAJOR_BYTES, value.length), value]);
}

function encodeArray(value: readonly unknown[]): Uint8Array {
  const parts: Uint8Array[] = [encodeHead(MAJOR_ARRAY, value.length)];
  for (const item of value) {
    parts.push(_encode(item));
  }
  return concat(parts);
}

function compareBytes(a: Uint8Array, b: Uint8Array): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i]!;
    const bv = b[i]!;
    if (av !== bv) return av - bv;
  }
  return a.length - b.length;
}

function encodeObject(value: Record<string, unknown>): Uint8Array {
  // Skip undefined values to match JSON semantics.
  const keys = Object.keys(value).filter((k) => value[k] !== undefined);
  const pairs: { keyBytes: Uint8Array; valueBytes: Uint8Array }[] = [];
  for (const key of keys) {
    pairs.push({
      keyBytes: encodeString(key),
      valueBytes: _encode(value[key]),
    });
  }
  // RFC 8949 §4.2.1: sort by encoded-key byte sequence, lexicographically.
  pairs.sort((p, q) => compareBytes(p.keyBytes, q.keyBytes));

  const parts: Uint8Array[] = [encodeHead(MAJOR_MAP, pairs.length)];
  for (const pair of pairs) {
    parts.push(pair.keyBytes);
    parts.push(pair.valueBytes);
  }
  return concat(parts);
}

const _encode = (value: unknown): Uint8Array => {
  if (value === null || value === undefined) {
    return new Uint8Array([MAJOR_SIMPLE | SIMPLE_NULL]);
  }
  if (typeof value === 'boolean') {
    return new Uint8Array([MAJOR_SIMPLE | (value ? SIMPLE_TRUE : SIMPLE_FALSE)]);
  }
  if (typeof value === 'number') {
    return encodeNumber(value);
  }
  if (typeof value === 'string') {
    return encodeString(value);
  }
  if (value instanceof Uint8Array) {
    return encodeBytes(value);
  }
  if (Array.isArray(value)) {
    return encodeArray(value);
  }
  if (typeof value === 'object') {
    return encodeObject(value as Record<string, unknown>);
  }
  throw new TypeError(`CanonicalCbor: unsupported value type ${typeof value}`);
};

/** Canonical CBOR encoder namespace (ADR-0001 pattern). */
export const CanonicalCbor = { encode: _encode } as const;

export declare namespace CanonicalCbor {
  /** Output type — raw CBOR bytes per RFC 8949 §4.2.1. */
  export type Encoded = Uint8Array;
}
