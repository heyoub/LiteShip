/**
 * Receipt -- chain validation, MAC signing, fork detection, and linearization.
 */

import { describe, test, expect } from 'vitest';
import { Effect } from 'effect';
import { Receipt, HLC } from '@czap/core';
import type { ReceiptEnvelope, ReceiptSubject } from '@czap/core';

const subject = (id: string): ReceiptSubject => ({ type: 'effect', id });

const makePayload = () => ({ schema_hash: 'sha256:test', content_hash: 'sha256:payload' });

const makeEntries = (count: number) => {
  const entries: Array<{
    kind: string;
    subject: ReceiptSubject;
    payload: ReturnType<typeof makePayload>;
    timestamp: HLC.Shape;
  }> = [];
  let hlc = HLC.create('node-a');
  for (let i = 0; i < count; i++) {
    hlc = HLC.increment(hlc, 1000 + i * 100);
    entries.push({ kind: 'test', subject: subject('actor-1'), payload: makePayload(), timestamp: hlc });
  }
  return entries;
};

describe('Receipt', () => {
  describe('chain validation', () => {
    test('buildChain produces valid chain that passes validateChain', async () => {
      const chain = await Effect.runPromise(Receipt.buildChain(makeEntries(5)));
      expect(chain).toHaveLength(5);
      const valid = await Effect.runPromise(Receipt.validateChain(chain));
      expect(valid).toBe(true);
    });

    test('first envelope has genesis as previous', async () => {
      const chain = await Effect.runPromise(Receipt.buildChain(makeEntries(1)));
      expect(chain[0]!.previous).toBe(Receipt.GENESIS);
      expect(Receipt.isGenesis(chain[0]!)).toBe(true);
    });

    test('consecutive envelopes link via previous hash', async () => {
      const chain = await Effect.runPromise(Receipt.buildChain(makeEntries(3)));
      expect(chain[1]!.previous).toBe(chain[0]!.hash);
      expect(chain[2]!.previous).toBe(chain[1]!.hash);
    });

    test('validateChainDetailed returns true for valid chain', async () => {
      const chain = await Effect.runPromise(Receipt.buildChain(makeEntries(3)));
      const result = await Effect.runPromise(Receipt.validateChainDetailed(chain));
      expect(result).toBe(true);
    });

    test('validateChainDetailed accepts an empty chain', async () => {
      await expect(Effect.runPromise(Receipt.validateChainDetailed([]))).resolves.toBe(true);
    });

    test('validateChainDetailed detects hash mismatch', async () => {
      const chain = await Effect.runPromise(Receipt.buildChain(makeEntries(3)));
      const tampered = [...chain];
      tampered[1] = { ...tampered[1]!, hash: 'tampered-hash' };
      const result = await Effect.runPromise(Receipt.validateChainDetailed(tampered).pipe(Effect.flip));
      expect(result.type).toBe('hash_mismatch');
      expect(result.index).toBe(1);
    });

    test('validateChainDetailed detects chain break', async () => {
      const entries = makeEntries(3);
      const chain = await Effect.runPromise(Receipt.buildChain(entries));
      const detachedEntry = entries[2]!;
      const detached = await Effect.runPromise(
        Receipt.createEnvelope(
          detachedEntry.kind,
          detachedEntry.subject,
          detachedEntry.payload,
          detachedEntry.timestamp,
          'wrong-previous-hash',
        ),
      );
      const broken = [chain[0]!, chain[1]!, detached];
      const result = await Effect.runPromise(Receipt.validateChainDetailed(broken).pipe(Effect.flip));
      expect(result.type).toBe('chain_break');
      expect(result.index).toBe(2);
    });

    test('validateChainDetailed detects non-genesis roots', async () => {
      const hlc = HLC.increment(HLC.create('node-a'), 1000);
      const envelope = await Effect.runPromise(
        Receipt.createEnvelope('test', subject('actor-1'), makePayload(), hlc, 'not-genesis'),
      );

      const result = await Effect.runPromise(Receipt.validateChainDetailed([envelope]).pipe(Effect.flip));
      expect(result).toEqual({ type: 'not_genesis', index: 0 });
    });

    test('validateChainDetailed detects non-increasing HLC values', async () => {
      const entries = makeEntries(3);
      const chain = await Effect.runPromise(Receipt.buildChain(entries));
      const stale = await Effect.runPromise(
        Receipt.createEnvelope(
          chain[2]!.kind,
          chain[2]!.subject,
          chain[2]!.payload,
          chain[0]!.timestamp,
          chain[1]!.hash,
        ),
      );

      const result = await Effect.runPromise(
        Receipt.validateChainDetailed([chain[0]!, chain[1]!, stale]).pipe(Effect.flip),
      );
      expect(result).toEqual({ type: 'hlc_not_increasing', index: 2 });
    });

    test('validateChain rejects chain with non-genesis first element', async () => {
      const hlc = HLC.increment(HLC.create('node-a'), 1000);
      const envelope = await Effect.runPromise(
        Receipt.createEnvelope('test', subject('actor-1'), makePayload(), hlc, 'not-genesis'),
      );
      const err = await Effect.runPromise(Receipt.validateChain([envelope]).pipe(Effect.flip));
      expect(err).toBeInstanceOf(Error);
    });

    test('validateChain rejects hash mismatches, chain breaks, and non-increasing HLC values', async () => {
      const entries = makeEntries(3);
      const chain = await Effect.runPromise(Receipt.buildChain(entries));

      const tampered = [...chain];
      tampered[1] = { ...tampered[1]!, hash: 'tampered-hash' };
      await expect(Effect.runPromise(Receipt.validateChain(tampered))).rejects.toThrow(/hash mismatch/);

      const detached = await Effect.runPromise(
        Receipt.createEnvelope(
          entries[2]!.kind,
          entries[2]!.subject,
          entries[2]!.payload,
          entries[2]!.timestamp,
          'wrong-previous-hash',
        ),
      );
      await expect(Effect.runPromise(Receipt.validateChain([chain[0]!, chain[1]!, detached]))).rejects.toThrow(
        /chain break/,
      );

      const stale = await Effect.runPromise(
        Receipt.createEnvelope(
          chain[2]!.kind,
          chain[2]!.subject,
          chain[2]!.payload,
          chain[0]!.timestamp,
          chain[1]!.hash,
        ),
      );
      await expect(Effect.runPromise(Receipt.validateChain([chain[0]!, chain[1]!, stale]))).rejects.toThrow(
        /HLC not monotonically increasing/,
      );
    });

    test('empty chain validates successfully', async () => {
      const valid = await Effect.runPromise(Receipt.validateChain([]));
      expect(valid).toBe(true);
    });

    test('validateChain accepts merge envelopes without forcing linear previous or HLC monotonicity', async () => {
      const chain = await Effect.runPromise(Receipt.buildChain(makeEntries(1)));
      const mergeEnvelope = await Effect.runPromise(
        Receipt.createEnvelope(
          'merge',
          subject('actor-1'),
          makePayload(),
          chain[0]!.timestamp,
          ['branch-b', chain[0]!.hash],
        ),
      );

      await expect(Effect.runPromise(Receipt.validateChain([chain[0]!, mergeEnvelope]))).resolves.toBe(true);
    });

    test('validateChain and validateChainDetailed accept genesis arrays as valid roots', async () => {
      const hlc = HLC.increment(HLC.create('node-a'), 1000);
      const envelope = await Effect.runPromise(
        Receipt.createEnvelope('merge-root', subject('actor-1'), makePayload(), hlc, ['branch-a', Receipt.GENESIS]),
      );

      await expect(Effect.runPromise(Receipt.validateChain([envelope]))).resolves.toBe(true);
      await expect(Effect.runPromise(Receipt.validateChainDetailed([envelope]))).resolves.toBe(true);
    });
  });

  describe('head / tail / find', () => {
    test('head returns last envelope, tail returns first', async () => {
      const chain = await Effect.runPromise(Receipt.buildChain(makeEntries(4)));
      expect(Receipt.head(chain)!.hash).toBe(chain[3]!.hash);
      expect(Receipt.tail(chain)!.hash).toBe(chain[0]!.hash);
    });

    test('head/tail return undefined for empty chain', () => {
      expect(Receipt.head([])).toBeUndefined();
      expect(Receipt.tail([])).toBeUndefined();
    });

    test('findByHash locates envelope', async () => {
      const chain = await Effect.runPromise(Receipt.buildChain(makeEntries(3)));
      const target = chain[1]!;
      expect(Receipt.findByHash(chain, target.hash)!.hash).toBe(target.hash);
      expect(Receipt.findByHash(chain, 'nonexistent')).toBeUndefined();
    });

    test('findByKind filters by kind', async () => {
      const chain = await Effect.runPromise(Receipt.buildChain(makeEntries(3)));
      expect(Receipt.findByKind(chain, 'test')).toHaveLength(3);
      expect(Receipt.findByKind(chain, 'other')).toHaveLength(0);
    });
  });

  describe('append', () => {
    test('append extends chain and preserves validity', async () => {
      const chain = await Effect.runPromise(Receipt.buildChain(makeEntries(2)));
      const hlc = HLC.increment(chain[1]!.timestamp, 2000);
      const extended = await Effect.runPromise(
        Receipt.append(chain, {
          kind: 'appended',
          subject: subject('actor-1'),
          payload: makePayload(),
          timestamp: hlc,
        }),
      );
      expect(extended).toHaveLength(3);
      expect(extended[2]!.previous).toBe(chain[1]!.hash);
      const valid = await Effect.runPromise(Receipt.validateChain(extended));
      expect(valid).toBe(true);
    });

    test('append to empty chain uses genesis', async () => {
      const hlc = HLC.increment(HLC.create('node-a'), 1000);
      const chain = await Effect.runPromise(
        Receipt.append([], { kind: 'first', subject: subject('actor-1'), payload: makePayload(), timestamp: hlc }),
      );
      expect(chain).toHaveLength(1);
      expect(Receipt.isGenesis(chain[0]!)).toBe(true);
    });
  });

  describe('MAC verification', () => {
    test('sign and verify MAC roundtrip succeeds', async () => {
      const chain = await Effect.runPromise(Receipt.buildChain(makeEntries(1)));
      const key = await Effect.runPromise(Receipt.generateMACKey());
      const signed = await Effect.runPromise(Receipt.macEnvelope(chain[0]!, key));
      expect(signed.signature).toBeDefined();
      expect(typeof signed.signature).toBe('string');
      expect(signed.signature!.length).toBeGreaterThan(0);
      const verified = await Effect.runPromise(Receipt.verifyMAC(signed, key));
      expect(verified).toBe(true);
    });

    test('unsigned envelope fails MAC verification', async () => {
      const chain = await Effect.runPromise(Receipt.buildChain(makeEntries(1)));
      const key = await Effect.runPromise(Receipt.generateMACKey());
      const verified = await Effect.runPromise(Receipt.verifyMAC(chain[0]!, key));
      expect(verified).toBe(false);
    });

    test('MAC with wrong key fails verification', async () => {
      const chain = await Effect.runPromise(Receipt.buildChain(makeEntries(1)));
      const key1 = await Effect.runPromise(Receipt.generateMACKey());
      const key2 = await Effect.runPromise(Receipt.generateMACKey());
      const signed = await Effect.runPromise(Receipt.macEnvelope(chain[0]!, key1));
      const verified = await Effect.runPromise(Receipt.verifyMAC(signed, key2));
      expect(verified).toBe(false);
    });

    test('verifyMAC with empty signature returns false', async () => {
      const chain = await Effect.runPromise(Receipt.buildChain(makeEntries(1)));
      const key = await Effect.runPromise(Receipt.generateMACKey());
      const envelope = { ...chain[0]!, signature: '' };
      const verified = await Effect.runPromise(Receipt.verifyMAC(envelope, key));
      expect(verified).toBe(false);
    });

    test('verifyMAC with whitespace hex fails with clear error', async () => {
      const chain = await Effect.runPromise(Receipt.buildChain(makeEntries(1)));
      const key = await Effect.runPromise(Receipt.generateMACKey());
      const envelope = { ...chain[0]!, signature: 'ab cd ef' };
      const err = await Effect.runPromise(Receipt.verifyMAC(envelope, key).pipe(Effect.flip));
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toContain('Invalid signature hex');
    });

    test('verifyMAC with odd-length hex fails', async () => {
      const chain = await Effect.runPromise(Receipt.buildChain(makeEntries(1)));
      const key = await Effect.runPromise(Receipt.generateMACKey());
      const envelope = { ...chain[0]!, signature: 'abc' };
      const err = await Effect.runPromise(Receipt.verifyMAC(envelope, key).pipe(Effect.flip));
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toContain('Invalid signature hex');
    });

    test('verifyMAC with valid hex proceeds normally', async () => {
      const chain = await Effect.runPromise(Receipt.buildChain(makeEntries(1)));
      const key = await Effect.runPromise(Receipt.generateMACKey());
      const signed = await Effect.runPromise(Receipt.macEnvelope(chain[0]!, key));
      // Verify the signature is valid hex
      expect(signed.signature).toMatch(/^[0-9a-fA-F]+$/);
      expect(signed.signature!.length % 2).toBe(0);
      const verified = await Effect.runPromise(Receipt.verifyMAC(signed, key));
      expect(verified).toBe(true);
    });

    test('generateMACKey surfaces crypto generation failures with wrapped context', async () => {
      const originalGenerateKey = crypto.subtle.generateKey.bind(crypto.subtle);
      crypto.subtle.generateKey = (async () => {
        throw new Error('generate exploded');
      }) as typeof crypto.subtle.generateKey;

      try {
        await expect(Effect.runPromise(Receipt.generateMACKey())).rejects.toThrow(/Failed to generate MAC key/);
      } finally {
        crypto.subtle.generateKey = originalGenerateKey;
      }
    });

    test('macEnvelope surfaces crypto signing failures with wrapped context', async () => {
      const chain = await Effect.runPromise(Receipt.buildChain(makeEntries(1)));
      const key = await Effect.runPromise(Receipt.generateMACKey());
      const originalSign = crypto.subtle.sign.bind(crypto.subtle);
      crypto.subtle.sign = (async () => {
        throw new Error('sign exploded');
      }) as typeof crypto.subtle.sign;

      try {
        await expect(Effect.runPromise(Receipt.macEnvelope(chain[0]!, key))).rejects.toThrow(
          /Failed to MAC envelope/,
        );
      } finally {
        crypto.subtle.sign = originalSign;
      }
    });

    test('verifyMAC surfaces crypto verification failures with wrapped context', async () => {
      const chain = await Effect.runPromise(Receipt.buildChain(makeEntries(1)));
      const key = await Effect.runPromise(Receipt.generateMACKey());
      const signed = await Effect.runPromise(Receipt.macEnvelope(chain[0]!, key));
      const originalVerify = crypto.subtle.verify.bind(crypto.subtle);
      crypto.subtle.verify = (async () => {
        throw new Error('verify exploded');
      }) as typeof crypto.subtle.verify;

      try {
        await expect(Effect.runPromise(Receipt.verifyMAC(signed, key))).rejects.toThrow(
          /Failed to verify signature/,
        );
      } finally {
        crypto.subtle.verify = originalVerify;
      }
    });
  });

  describe('multi-parent merge receipts', () => {
    test('createEnvelope with array previous produces merge envelope', async () => {
      const chain1 = await Effect.runPromise(Receipt.buildChain(makeEntries(2)));
      const chain2entries = makeEntries(2).map((e, i) => ({
        ...e,
        subject: subject('actor-2'),
        timestamp: HLC.increment(HLC.create('node-b'), 3000 + i * 100),
      }));
      const chain2 = await Effect.runPromise(Receipt.buildChain(chain2entries));

      const mergeTs = HLC.increment(HLC.create('node-a'), 5000);
      const mergeEnvelope = await Effect.runPromise(
        Receipt.createEnvelope('merge', subject('actor-1'), makePayload(), mergeTs, [chain1[1]!.hash, chain2[1]!.hash]),
      );

      expect(Array.isArray(mergeEnvelope.previous)).toBe(true);
      const parents = mergeEnvelope.previous as readonly string[];
      expect(parents).toContain(chain1[1]!.hash);
      expect(parents).toContain(chain2[1]!.hash);
    });

    test('append with explicit previousHashes creates merge receipt', async () => {
      const chain = await Effect.runPromise(Receipt.buildChain(makeEntries(2)));
      const otherChain = await Effect.runPromise(
        Receipt.buildChain(
          makeEntries(1).map((e) => ({
            ...e,
            subject: subject('actor-2'),
            timestamp: HLC.increment(HLC.create('node-b'), 4000),
          })),
        ),
      );

      const mergeTs = HLC.increment(HLC.create('node-a'), 6000);
      const merged = await Effect.runPromise(
        Receipt.append(
          chain,
          { kind: 'merge', subject: subject('actor-1'), payload: makePayload(), timestamp: mergeTs },
          [chain[1]!.hash, otherChain[0]!.hash],
        ),
      );

      const mergeEnv = merged[merged.length - 1]!;
      expect(Array.isArray(mergeEnv.previous)).toBe(true);
    });

    test('hashEnvelope normalizes merge parent ordering and genesis arrays are recognized', async () => {
      const chain = await Effect.runPromise(Receipt.buildChain(makeEntries(1)));
      const mergeTs = HLC.increment(HLC.create('node-a'), 6000);
      const unsorted = await Effect.runPromise(
        Receipt.createEnvelope('merge', subject('actor-1'), makePayload(), mergeTs, ['z-parent', chain[0]!.hash]),
      );
      const sorted = {
        ...unsorted,
        previous: [chain[0]!.hash, 'z-parent'] as const,
      } satisfies ReceiptEnvelope;

      const unsortedHash = await Effect.runPromise(Receipt.hashEnvelope(unsorted));
      const sortedHash = await Effect.runPromise(Receipt.hashEnvelope(sorted));

      expect(unsortedHash).toBe(sortedHash);
      expect(Receipt.isGenesis({ ...unsorted, previous: ['fork', Receipt.GENESIS] })).toBe(true);
    });
  });
});
