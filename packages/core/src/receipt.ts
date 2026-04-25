/**
 * Receipt -- chain validation and envelope construction.
 *
 * Salvaged from `@kit/core`.
 *
 * @module
 */

import { Effect } from 'effect';
import type { HLC } from './brands.js';
import { TypedRef as TypedRefModule, type TypedRef } from './typed-ref.js';
import { HLC as HLCOps } from './hlc.js';

/** The logical entity a receipt describes: an effect, a run, an artifact, or an intent. */
export interface ReceiptSubject {
  readonly type: 'effect' | 'run' | 'artifact' | 'intent';
  readonly id: string;
}

/**
 * Single link in a receipt chain: timestamped, content-addressed, and linked
 * to its predecessor(s). Merge envelopes carry an array of `previous` hashes;
 * optionally MAC-signed via `Receipt.macEnvelope`.
 */
export interface ReceiptEnvelope {
  readonly kind: string;
  readonly timestamp: HLC;
  readonly subject: ReceiptSubject;
  readonly payload: TypedRef.Shape;
  readonly hash: string;
  readonly previous: string | readonly string[];
  readonly signature?: string;
}

/** Structured failure returned by `Receipt.validateChainDetailed`. */
export type ChainValidationError =
  | { readonly type: 'not_genesis'; readonly index: 0 }
  | { readonly type: 'hash_mismatch'; readonly index: number; readonly computed: string; readonly stored: string }
  | { readonly type: 'chain_break'; readonly index: number; readonly expected: string; readonly actual: string }
  | { readonly type: 'hlc_not_increasing'; readonly index: number };

/** Sentinel `previous` value marking the root of a receipt chain. */
export const GENESIS: string = 'genesis';

/**
 * Compute the content hash of a receipt envelope.
 *
 * Normalizes the `previous` field (sorts array form), canonicalizes the
 * payload, and hashes with SHA-256 via TypedRef.
 *
 * @example
 * ```ts
 * import { Effect } from 'effect';
 *
 * const hash = yield* Receipt.hashEnvelope(envelope);
 * // hash === envelope.hash (if envelope is valid)
 * ```
 */
export const hashEnvelope = (envelope: ReceiptEnvelope): Effect.Effect<string> => {
  const previousNormalized = Array.isArray(envelope.previous)
    ? [...(envelope.previous as readonly string[])].sort()
    : envelope.previous;
  const hashInput = TypedRefModule.canonicalize({
    kind: envelope.kind,
    timestamp: envelope.timestamp,
    subject: envelope.subject,
    payload: envelope.payload,
    previous: previousNormalized,
  });
  return TypedRefModule.hash(hashInput);
};

/**
 * Create a new receipt envelope with an auto-computed content hash.
 *
 * @example
 * ```ts
 * const envelope = yield* Receipt.createEnvelope(
 *   'state-change',
 *   { type: 'effect', id: 'actor-1' },
 *   { _tag: 'TypedRef', mediaType: 'application/json', data: { key: 'value' } },
 *   hlcTimestamp,
 *   Receipt.GENESIS,
 * );
 * // envelope.hash is the computed SHA-256 content address
 * ```
 */
export const createEnvelope = (
  kind: string,
  subject: ReceiptSubject,
  payload: TypedRef.Shape,
  timestamp: HLC,
  previousHash: string | readonly string[],
): Effect.Effect<ReceiptEnvelope> =>
  Effect.gen(function* () {
    const previousNormalized = Array.isArray(previousHash)
      ? [...(previousHash as readonly string[])].sort()
      : previousHash;
    const partial = { kind, timestamp, subject, payload, previous: previousNormalized };
    const h = yield* TypedRefModule.hash(TypedRefModule.canonicalize(partial));
    return { kind, timestamp, subject, payload, hash: h, previous: previousNormalized };
  });

/**
 * Build a linear chain of receipt envelopes from an array of entries.
 *
 * Each envelope's `previous` points to the prior envelope's hash,
 * starting from GENESIS.
 *
 * @example
 * ```ts
 * const chain = yield* Receipt.buildChain([
 *   { kind: 'init', subject: { type: 'effect', id: 'a' }, payload, timestamp: ts1 },
 *   { kind: 'update', subject: { type: 'effect', id: 'a' }, payload, timestamp: ts2 },
 * ]);
 * // chain.length === 2
 * // chain[1].previous === chain[0].hash
 * ```
 */
export const buildChain = (
  entries: ReadonlyArray<{
    kind: string;
    subject: ReceiptSubject;
    payload: TypedRef.Shape;
    timestamp: HLC;
  }>,
): Effect.Effect<ReceiptEnvelope[]> =>
  Effect.gen(function* () {
    const chain: ReceiptEnvelope[] = [];
    let previousHash = GENESIS;
    for (const entry of entries) {
      const envelope = yield* createEnvelope(entry.kind, entry.subject, entry.payload, entry.timestamp, previousHash);
      chain.push(envelope);
      previousHash = envelope.hash;
    }
    return chain;
  });

/**
 * Validate a receipt chain: genesis link, hash integrity, chain continuity, HLC ordering.
 *
 * Returns true on success or fails with an Error describing the violation.
 *
 * @example
 * ```ts
 * const chain = yield* Receipt.buildChain(entries);
 * const valid = yield* Receipt.validateChain(chain);
 * // valid === true
 * ```
 */
export const validateChain = (chain: ReadonlyArray<ReceiptEnvelope>): Effect.Effect<boolean, Error> =>
  Effect.gen(function* () {
    if (chain.length === 0) return true;
    const first = chain[0]!;
    const firstPrev = first.previous;
    if (firstPrev !== GENESIS && !(Array.isArray(firstPrev) && (firstPrev as readonly string[]).includes(GENESIS))) {
      return yield* Effect.fail(new Error('First envelope must have previous=genesis'));
    }
    for (let i = 0; i < chain.length; i++) {
      const envelope = chain[i]!;
      const computedHash = yield* hashEnvelope(envelope);
      if (computedHash !== envelope.hash) {
        return yield* Effect.fail(
          new Error(`Envelope ${i}: hash mismatch (expected "${envelope.hash}", computed "${computedHash}")`),
        );
      }
      const isMerge = Array.isArray(envelope.previous);
      if (!isMerge && i > 0 && envelope.previous !== chain[i - 1]!.hash) {
        return yield* Effect.fail(new Error(`Envelope ${i}: chain break`));
      }
      if (!isMerge && i > 0 && HLCOps.compare(chain[i - 1]!.timestamp, envelope.timestamp) >= 0) {
        return yield* Effect.fail(new Error(`Envelope ${i}: HLC not monotonically increasing`));
      }
    }
    return true;
  });

/**
 * Validate a receipt chain with detailed, structured error reporting.
 *
 * Returns `true` on success or fails with a typed `ChainValidationError`
 * discriminated union (not_genesis | hash_mismatch | chain_break | hlc_not_increasing).
 *
 * @example
 * ```ts
 * import { Effect } from 'effect';
 *
 * const result = yield* Effect.either(Receipt.validateChainDetailed(chain));
 * // result._tag === 'Right' on success
 * // result._tag === 'Left' with .left.type on failure
 * ```
 */
export const validateChainDetailed = (
  chain: ReadonlyArray<ReceiptEnvelope>,
): Effect.Effect<true, ChainValidationError> =>
  Effect.gen(function* () {
    if (chain.length === 0) return true as const;

    const first = chain[0]!;
    const firstPrev = first.previous;
    const firstIsGenesis =
      firstPrev === GENESIS || (Array.isArray(firstPrev) && (firstPrev as readonly string[]).includes(GENESIS));
    if (!firstIsGenesis) {
      return yield* Effect.fail({ type: 'not_genesis' as const, index: 0 as const });
    }

    for (let i = 0; i < chain.length; i++) {
      const envelope = chain[i]!;
      const isMerge = Array.isArray(envelope.previous);

      const computedHash = yield* hashEnvelope(envelope);
      if (computedHash !== envelope.hash) {
        return yield* Effect.fail({
          type: 'hash_mismatch' as const,
          index: i,
          computed: computedHash,
          stored: envelope.hash,
        });
      }

      if (!isMerge && i > 0 && envelope.previous !== chain[i - 1]!.hash) {
        return yield* Effect.fail({
          type: 'chain_break' as const,
          index: i,
          expected: chain[i - 1]!.hash,
          actual: envelope.previous as string,
        });
      }

      if (!isMerge && i > 0 && HLCOps.compare(chain[i - 1]!.timestamp, envelope.timestamp) >= 0) {
        return yield* Effect.fail({
          type: 'hlc_not_increasing' as const,
          index: i,
        });
      }
    }

    return true as const;
  });

/**
 * Check whether a receipt envelope is a genesis (root) envelope.
 *
 * @example
 * ```ts
 * const chain = yield* Receipt.buildChain(entries);
 * Receipt.isGenesis(chain[0]); // true
 * Receipt.isGenesis(chain[1]); // false
 * ```
 */
export const isGenesis = (receipt: ReceiptEnvelope): boolean =>
  receipt.previous === GENESIS ||
  (Array.isArray(receipt.previous) && (receipt.previous as readonly string[]).includes(GENESIS));

/**
 * Get the last (most recent) envelope in a chain.
 *
 * @example
 * ```ts
 * const latest = Receipt.head(chain);
 * // latest === chain[chain.length - 1]
 * ```
 */
export const head = (chain: ReadonlyArray<ReceiptEnvelope>): ReceiptEnvelope | undefined =>
  chain.length > 0 ? chain[chain.length - 1] : undefined;

/**
 * Get the first (genesis) envelope in a chain.
 *
 * @example
 * ```ts
 * const first = Receipt.tail(chain);
 * // first === chain[0]
 * ```
 */
export const tail = (chain: ReadonlyArray<ReceiptEnvelope>): ReceiptEnvelope | undefined =>
  chain.length > 0 ? chain[0] : undefined;

/**
 * Append a new entry to an existing chain, auto-linking to the previous hash.
 *
 * Optionally accepts explicit previous hashes for merge envelopes.
 *
 * @example
 * ```ts
 * const chain = yield* Receipt.buildChain([entry1]);
 * const extended = yield* Receipt.append(chain, {
 *   kind: 'update', subject: { type: 'effect', id: 'a' }, payload, timestamp: ts2,
 * });
 * // extended.length === 2
 * ```
 */
export const append = (
  chain: ReadonlyArray<ReceiptEnvelope>,
  entry: { kind: string; subject: ReceiptSubject; payload: TypedRef.Shape; timestamp: HLC },
  previousHashes?: readonly string[],
): Effect.Effect<ReceiptEnvelope[]> =>
  Effect.gen(function* () {
    const previousHash: string | readonly string[] = previousHashes
      ? previousHashes
      : chain.length > 0
        ? chain[chain.length - 1]!.hash
        : GENESIS;
    const envelope = yield* createEnvelope(entry.kind, entry.subject, entry.payload, entry.timestamp, previousHash);
    return [...chain, envelope];
  });

/**
 * Find an envelope in a chain by its content hash.
 *
 * @example
 * ```ts
 * const found = Receipt.findByHash(chain, targetHash);
 * // found?.hash === targetHash
 * ```
 */
export const findByHash = (chain: ReadonlyArray<ReceiptEnvelope>, hash: string): ReceiptEnvelope | undefined =>
  chain.find((e) => e.hash === hash);

/**
 * Find all envelopes in a chain matching a given kind.
 *
 * @example
 * ```ts
 * const updates = Receipt.findByKind(chain, 'update');
 * // updates contains all envelopes with kind === 'update'
 * ```
 */
export const findByKind = (chain: ReadonlyArray<ReceiptEnvelope>, kind: string): ReceiptEnvelope[] =>
  chain.filter((e) => e.kind === kind);

/**
 * Generate an HMAC-SHA-256 key for signing receipt envelopes.
 *
 * @example
 * ```ts
 * const key = yield* Receipt.generateMACKey();
 * const signed = yield* Receipt.macEnvelope(envelope, key);
 * // signed.signature is a hex string
 * ```
 */
export const generateMACKey = (): Effect.Effect<CryptoKey, Error> =>
  Effect.tryPromise({
    try: () => crypto.subtle.generateKey({ name: 'HMAC', hash: { name: 'SHA-256' } }, true, ['sign', 'verify']),
    catch: (error) => new Error(`Failed to generate MAC key: ${error}`),
  });

/**
 * Sign a receipt envelope with an HMAC key, adding a `signature` field.
 *
 * @example
 * ```ts
 * const key = yield* Receipt.generateMACKey();
 * const signed = yield* Receipt.macEnvelope(envelope, key);
 * // signed.signature !== undefined
 * ```
 */
export const macEnvelope = (envelope: ReceiptEnvelope, key: CryptoKey): Effect.Effect<ReceiptEnvelope, Error> =>
  Effect.gen(function* () {
    const data = new TextEncoder().encode(envelope.hash);
    const signatureBuffer = yield* Effect.tryPromise({
      try: () => crypto.subtle.sign('HMAC', key, data),
      catch: (error) => new Error(`Failed to MAC envelope: ${error}`),
    });
    const signatureArray = Array.from(new Uint8Array(signatureBuffer));
    const signature = signatureArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    return { ...envelope, signature };
  });

/**
 * Verify an envelope's HMAC signature against a key.
 *
 * Returns false if the envelope has no signature.
 *
 * @example
 * ```ts
 * const valid = yield* Receipt.verifyMAC(signedEnvelope, key);
 * // valid === true if signature matches
 * ```
 */
export const verifyMAC = (envelope: ReceiptEnvelope, key: CryptoKey): Effect.Effect<boolean, Error> =>
  Effect.gen(function* () {
    if (!envelope.signature) return false;
    const signatureHex = envelope.signature;
    if (!/^[0-9a-fA-F]+$/.test(signatureHex) || signatureHex.length % 2 !== 0) {
      return yield* Effect.fail(new Error('Invalid signature hex: expected even-length hex string'));
    }
    const signatureArray = new Uint8Array(signatureHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)));
    const data = new TextEncoder().encode(envelope.hash);
    const valid = yield* Effect.tryPromise({
      try: () => crypto.subtle.verify('HMAC', key, signatureArray, data),
      catch: (error) => new Error(`Failed to verify signature: ${error}`),
    });
    return valid;
  });

/**
 * Receipt namespace -- chain validation and envelope construction.
 *
 * Build, validate, append, query, and sign linear receipt chains.
 * Each envelope is content-addressed and linked to its predecessor.
 * Supports HMAC signing/verification for tamper detection.
 *
 * @example
 * ```ts
 * import { Effect } from 'effect';
 * import { Receipt, HLC } from '@czap/core';
 *
 * const program = Effect.gen(function* () {
 *   const ts = HLC.increment(HLC.create('node-1'), Date.now());
 *   const chain = yield* Receipt.buildChain([
 *     { kind: 'init', subject: { type: 'effect', id: 'a' }, payload, timestamp: ts },
 *   ]);
 *   const valid = yield* Receipt.validateChain(chain);
 *   const latest = Receipt.head(chain);
 * });
 * ```
 */
export const Receipt = {
  GENESIS,
  createEnvelope,
  buildChain,
  validateChain,
  validateChainDetailed,
  hashEnvelope,
  isGenesis,
  head,
  tail,
  append,
  findByHash,
  findByKind,
  generateMACKey,
  macEnvelope,
  verifyMAC,
};

export declare namespace Receipt {
  /** Alias for {@link ReceiptSubject}. */
  export type Subject = ReceiptSubject;
  /** Alias for {@link ReceiptEnvelope}. */
  export type Envelope = ReceiptEnvelope;
  /** Alias for {@link ChainValidationError}. */
  export type ChainError = ChainValidationError;
}
