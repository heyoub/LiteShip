/**
 * Property test: DAG acyclicity and linearization.
 *
 * Receipt DAGs maintain topological order and structural invariants.
 */

import { describe, test, expect } from 'vitest';
import fc from 'fast-check';
import { Effect } from 'effect';
import { DAG, Receipt, HLC } from '@czap/core';

// ---------------------------------------------------------------------------
// Helper: create a simple receipt envelope
// ---------------------------------------------------------------------------

function makeEnvelope(kind: string, previous: string | readonly string[], nodeId: string, wallMs: number): any {
  const timestamp = { wall_ms: wallMs, counter: 0, node_id: nodeId };
  return {
    kind,
    timestamp,
    subject: { type: 'effect' as const, id: `${kind}-${wallMs}` },
    payload: { schema_hash: 'test', content_hash: `hash-${kind}-${wallMs}` },
    hash: `hash-${kind}-${wallMs}-${nodeId}`,
    previous,
  };
}

describe('DAG properties', () => {
  test('empty DAG has no nodes', () => {
    const dag = DAG.empty();
    expect(DAG.size(dag)).toBe(0);
    expect(dag.heads).toEqual([]);
    expect(dag.genesis).toBeNull();
  });

  test('single ingest produces size 1', () => {
    const dag = DAG.empty();
    const envelope = makeEnvelope('init', 'genesis', 'a', 1000);
    const updated = DAG.ingest(dag, envelope);
    expect(DAG.size(updated)).toBe(1);
  });

  test('linearize preserves all nodes', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 10 }), (chainLength) => {
        let dag = DAG.empty();
        let prevHash = 'genesis';

        for (let i = 0; i < chainLength; i++) {
          const env = makeEnvelope(`step-${i}`, prevHash, 'node-a', 1000 + i);
          dag = DAG.ingest(dag, env);
          prevHash = env.hash;
        }

        const linear = DAG.linearize(dag);
        return linear.length === chainLength;
      }),
    );
  });

  test('linearize respects causal order: parents before children', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 8 }), (chainLength) => {
        let dag = DAG.empty();
        let prevHash = 'genesis';
        const hashes: string[] = [];

        for (let i = 0; i < chainLength; i++) {
          const env = makeEnvelope(`step-${i}`, prevHash, 'node-a', 1000 + i);
          dag = DAG.ingest(dag, env);
          hashes.push(env.hash);
          prevHash = env.hash;
        }

        const linear = DAG.linearize(dag);
        const hashOrder = linear.map((e) => e.hash);

        // Each hash should appear after its parent
        for (let i = 1; i < hashes.length; i++) {
          const parentIdx = hashOrder.indexOf(hashes[i - 1]);
          const childIdx = hashOrder.indexOf(hashes[i]);
          if (childIdx <= parentIdx) return false;
        }
        return true;
      }),
    );
  });

  test('linear chain has exactly one head (the last node)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 6 }), (chainLength) => {
        let dag = DAG.empty();
        let prevHash = 'genesis';

        for (let i = 0; i < chainLength; i++) {
          const env = makeEnvelope(`step-${i}`, prevHash, 'node-a', 1000 + i);
          dag = DAG.ingest(dag, env);
          prevHash = env.hash;
        }

        const heads = dag.heads;
        // A linear chain should have exactly one head
        return heads.length === 1;
      }),
    );
  });

  test('forked DAG has multiple heads', () => {
    let dag = DAG.empty();
    const genesis = makeEnvelope('init', 'genesis', 'a', 1000);
    dag = DAG.ingest(dag, genesis);

    // Two children from same parent = fork
    const fork1 = makeEnvelope('fork1', genesis.hash, 'b', 1001);
    const fork2 = makeEnvelope('fork2', genesis.hash, 'c', 1002);
    dag = DAG.ingest(dag, fork1);
    dag = DAG.ingest(dag, fork2);

    const heads = DAG.getHeads(dag);
    expect(heads.length).toBe(2);
    expect(DAG.isFork(dag)).toBe(true);
  });

  test('merge accepts array of envelopes into DAG', () => {
    const dag = DAG.empty();

    const env1 = makeEnvelope('a', 'genesis', 'node1', 1000);
    const env2 = makeEnvelope('b', env1.hash, 'node1', 1001);

    const merged = DAG.merge(dag, [env1, env2]);
    expect(DAG.size(merged.dag)).toBe(2);
    expect(merged.added).toHaveLength(2);
  });
});
