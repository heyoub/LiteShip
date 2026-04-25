/**
 * Property test: Receipt chain integrity.
 *
 * Chain validation, hash determinism, and structural invariants.
 */

import { describe, test, expect } from 'vitest';
import fc from 'fast-check';
import { Effect } from 'effect';
import { Receipt, HLC } from '@czap/core';

describe('Receipt properties', () => {
  test('GENESIS is a known constant', () => {
    expect(Receipt.GENESIS).toBe('genesis');
  });

  test('isGenesis identifies genesis envelopes', () => {
    const env = {
      kind: 'init',
      timestamp: { wall_ms: 0, counter: 0, node_id: 'test' },
      subject: { type: 'effect' as const, id: 'test' },
      payload: { schema_hash: 'test', content_hash: 'test' },
      hash: 'test-hash',
      previous: 'genesis',
    };
    expect(Receipt.isGenesis(env)).toBe(true);

    const nonGenesis = { ...env, previous: 'some-other-hash' };
    expect(Receipt.isGenesis(nonGenesis)).toBe(false);
  });

  test('createEnvelope produces valid envelope shape', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 10 }),
        fc.string({ minLength: 1, maxLength: 10 }),
        async (kind, id) => {
          const timestamp = { wall_ms: Date.now(), counter: 0, node_id: 'test' };
          const subject = { type: 'effect' as const, id };
          const payload = { schema_hash: 'test', content_hash: 'test' };

          const envelope = await Effect.runPromise(
            Receipt.createEnvelope(kind, subject, payload, timestamp, 'genesis'),
          );

          return (
            envelope.kind === kind &&
            envelope.subject.id === id &&
            typeof envelope.hash === 'string' &&
            envelope.hash.length > 0 &&
            envelope.previous === 'genesis'
          );
        },
      ),
    );
  });

  test('hashEnvelope is deterministic', async () => {
    const env = {
      kind: 'test',
      timestamp: { wall_ms: 1000, counter: 0, node_id: 'a' },
      subject: { type: 'effect' as const, id: 'x' },
      payload: { schema_hash: 'sh', content_hash: 'ch' },
      hash: 'original-hash',
      previous: 'genesis',
    };

    const h1 = await Effect.runPromise(Receipt.hashEnvelope(env));
    const h2 = await Effect.runPromise(Receipt.hashEnvelope(env));

    expect(h1).toBe(h2);
  });

  test('buildChain links envelopes via previous hash', async () => {
    const entries = [
      {
        kind: 'step-0',
        timestamp: { wall_ms: 1000, counter: 0, node_id: 'a' },
        subject: { type: 'effect' as const, id: 's0' },
        payload: { schema_hash: 'test', content_hash: 'c0' },
      },
      {
        kind: 'step-1',
        timestamp: { wall_ms: 2000, counter: 0, node_id: 'a' },
        subject: { type: 'effect' as const, id: 's1' },
        payload: { schema_hash: 'test', content_hash: 'c1' },
      },
      {
        kind: 'step-2',
        timestamp: { wall_ms: 3000, counter: 0, node_id: 'a' },
        subject: { type: 'effect' as const, id: 's2' },
        payload: { schema_hash: 'test', content_hash: 'c2' },
      },
    ];

    const chain = await Effect.runPromise(Receipt.buildChain(entries));

    expect(chain).toHaveLength(3);

    // First should reference genesis
    expect(chain[0].previous).toBe('genesis');

    // Each subsequent should reference previous hash
    for (let i = 1; i < chain.length; i++) {
      expect(chain[i].previous).toBe(chain[i - 1].hash);
    }
  });

  test('validateChain accepts a valid chain', async () => {
    const entries = [
      {
        kind: 'init',
        timestamp: { wall_ms: 1000, counter: 0, node_id: 'a' },
        subject: { type: 'effect' as const, id: 's0' },
        payload: { schema_hash: 'test', content_hash: 'c0' },
      },
      {
        kind: 'update',
        timestamp: { wall_ms: 2000, counter: 0, node_id: 'a' },
        subject: { type: 'effect' as const, id: 's1' },
        payload: { schema_hash: 'test', content_hash: 'c1' },
      },
    ];

    const chain = await Effect.runPromise(Receipt.buildChain(entries));
    const result = await Effect.runPromise(Receipt.validateChain(chain));
    expect(result).toBe(true);
  });

  test('head returns last envelope', async () => {
    const entries = [
      {
        kind: 'a',
        timestamp: { wall_ms: 1000, counter: 0, node_id: 'a' },
        subject: { type: 'effect' as const, id: 's0' },
        payload: { schema_hash: 'test', content_hash: 'c0' },
      },
      {
        kind: 'b',
        timestamp: { wall_ms: 2000, counter: 0, node_id: 'a' },
        subject: { type: 'effect' as const, id: 's1' },
        payload: { schema_hash: 'test', content_hash: 'c1' },
      },
    ];

    const chain = await Effect.runPromise(Receipt.buildChain(entries));
    const h = Receipt.head(chain);
    expect(h?.kind).toBe('b');
  });

  test('tail returns first envelope (oldest)', async () => {
    const entries = [
      {
        kind: 'a',
        timestamp: { wall_ms: 1000, counter: 0, node_id: 'a' },
        subject: { type: 'effect' as const, id: 's0' },
        payload: { schema_hash: 'test', content_hash: 'c0' },
      },
      {
        kind: 'b',
        timestamp: { wall_ms: 2000, counter: 0, node_id: 'a' },
        subject: { type: 'effect' as const, id: 's1' },
        payload: { schema_hash: 'test', content_hash: 'c1' },
      },
    ];

    const chain = await Effect.runPromise(Receipt.buildChain(entries));
    const t = Receipt.tail(chain);
    expect(t).toBeDefined();
    expect(t!.kind).toBe('a');
  });
});
