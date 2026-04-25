/**
 * DAG -- receipt DAG merge, linearization, ancestry, and fork detection.
 */

import { describe, test, expect } from 'vitest';
import { Effect } from 'effect';
import { DAG, Receipt, HLC } from '@czap/core';
import type { ReceiptSubject, ReceiptEnvelope } from '@czap/core';

const subject = (id: string): ReceiptSubject => ({ type: 'effect', id });
const payload = () => ({ schema_hash: 'sha256:test', content_hash: 'sha256:dag' });

const makeChain = async (actorId: string, nodeId: string, count: number, baseTime: number) => {
  const entries: Array<{
    kind: string;
    subject: ReceiptSubject;
    payload: ReturnType<typeof payload>;
    timestamp: HLC.Shape;
  }> = [];
  let hlc = HLC.create(nodeId);
  for (let i = 0; i < count; i++) {
    hlc = HLC.increment(hlc, baseTime + i * 100);
    entries.push({ kind: 'op', subject: subject(actorId), payload: payload(), timestamp: hlc });
  }
  return Effect.runPromise(Receipt.buildChain(entries));
};

describe('DAG', () => {
  describe('basic operations', () => {
    test('empty DAG has zero size and no heads', () => {
      const dag = DAG.empty();
      expect(DAG.size(dag)).toBe(0);
      expect(dag.heads).toHaveLength(0);
      expect(dag.genesis).toBeNull();
    });

    test('ingest single envelope creates genesis', async () => {
      const chain = await makeChain('actor-1', 'node-a', 1, 1000);
      const dag = DAG.ingest(DAG.empty(), chain[0]!);
      expect(DAG.size(dag)).toBe(1);
      expect(dag.genesis).toBe(chain[0]!.hash);
      expect(dag.heads).toContain(chain[0]!.hash);
    });

    test('ingest duplicate is idempotent', async () => {
      const chain = await makeChain('actor-1', 'node-a', 1, 1000);
      const dag1 = DAG.ingest(DAG.empty(), chain[0]!);
      const dag2 = DAG.ingest(dag1, chain[0]!);
      expect(DAG.size(dag2)).toBe(1);
    });

    test('ingesting a child before its parent retroactively wires the parent-child relationship', async () => {
      const chain = await makeChain('actor-1', 'node-a', 2, 1000);
      const withChildFirst = DAG.ingest(DAG.empty(), chain[1]!);
      const rewired = DAG.ingest(withChildFirst, chain[0]!);

      expect(rewired.heads).toEqual([chain[1]!.hash]);
      expect(rewired.nodes.get(chain[0]!.hash)?.children).toEqual([chain[1]!.hash]);
      expect(rewired.nodes.get(chain[1]!.hash)?.parents).toEqual([chain[0]!.hash]);
    });

    test('fromReceipts builds full DAG', async () => {
      const chain = await makeChain('actor-1', 'node-a', 4, 1000);
      const dag = DAG.fromReceipts(chain);
      expect(DAG.size(dag)).toBe(4);
      expect(dag.heads).toHaveLength(1);
      expect(dag.heads[0]).toBe(chain[3]!.hash);
    });
  });

  describe('multi-parent merge', () => {
    test('merge envelope with array previous connects multiple parents', async () => {
      const chain1 = await makeChain('actor-1', 'node-a', 2, 1000);
      const chain2 = await makeChain('actor-2', 'node-b', 2, 2000);

      let dag = DAG.fromReceipts(chain1);
      dag = DAG.ingestAll(dag, chain2);
      expect(DAG.isFork(dag)).toBe(true);
      expect(dag.heads).toHaveLength(2);

      const mergeTs = HLC.increment(HLC.create('node-a'), 5000);
      const mergeEnvelope = await Effect.runPromise(
        Receipt.createEnvelope('merge', subject('actor-1'), payload(), mergeTs, [chain1[1]!.hash, chain2[1]!.hash]),
      );

      dag = DAG.ingest(dag, mergeEnvelope);
      expect(DAG.isFork(dag)).toBe(false);
      expect(dag.heads).toHaveLength(1);
      expect(dag.heads[0]).toBe(mergeEnvelope.hash);

      const node = dag.nodes.get(mergeEnvelope.hash)!;
      expect(node.parents).toContain(chain1[1]!.hash);
      expect(node.parents).toContain(chain2[1]!.hash);
    });
  });

  describe('parentsOf behavior (single vs array previous)', () => {
    test('single previous string yields one parent', async () => {
      const chain = await makeChain('actor-1', 'node-a', 2, 1000);
      const dag = DAG.fromReceipts(chain);
      const secondNode = dag.nodes.get(chain[1]!.hash)!;
      expect(secondNode.parents).toHaveLength(1);
      expect(secondNode.parents[0]).toBe(chain[0]!.hash);
    });

    test('genesis envelope has no parents in DAG', async () => {
      const chain = await makeChain('actor-1', 'node-a', 1, 1000);
      const dag = DAG.fromReceipts(chain);
      const genesisNode = dag.nodes.get(chain[0]!.hash)!;
      expect(genesisNode.parents).toHaveLength(0);
    });

    test('merge-style genesis arrays still mark the ingested envelope as genesis', async () => {
      const mergeTs = HLC.increment(HLC.create('node-a'), 1000);
      const envelope = await Effect.runPromise(
        Receipt.createEnvelope('merge', subject('actor-1'), payload(), mergeTs, [Receipt.GENESIS, 'remote-head']),
      );

      const dag = DAG.ingest(DAG.empty(), envelope);

      expect(dag.genesis).toBe(envelope.hash);
      expect(dag.nodes.get(envelope.hash)?.parents).toEqual(['remote-head']);
    });
  });

  describe('linearization', () => {
    test('linearize preserves topological order', async () => {
      const chain = await makeChain('actor-1', 'node-a', 5, 1000);
      const dag = DAG.fromReceipts(chain);
      const linearized = DAG.linearize(dag);
      expect(linearized).toHaveLength(5);

      for (let i = 0; i < linearized.length; i++) {
        const node = dag.nodes.get(linearized[i]!.hash)!;
        for (const parentHash of node.parents) {
          const parentIdx = linearized.findIndex((e) => e.hash === parentHash);
          expect(parentIdx).toBeLessThan(i);
        }
      }
    });

    test('linearize empty DAG returns empty array', () => {
      expect(DAG.linearize(DAG.empty())).toHaveLength(0);
    });

    test('linearizeFrom returns envelopes after given hash', async () => {
      const chain = await makeChain('actor-1', 'node-a', 5, 1000);
      const dag = DAG.fromReceipts(chain);
      const after = DAG.linearizeFrom(dag, chain[1]!.hash);
      expect(after.length).toBe(3);
      expect(after.every((e) => e.hash !== chain[0]!.hash && e.hash !== chain[1]!.hash)).toBe(true);
    });

    test('linearizeFrom returns the full order when the anchor hash is missing', async () => {
      const chain = await makeChain('actor-1', 'node-a', 3, 1000);
      const dag = DAG.fromReceipts(chain);

      expect(DAG.linearizeFrom(dag, 'missing-hash').map((entry) => entry.hash)).toEqual(chain.map((entry) => entry.hash));
    });

    test('linearize ignores missing parent references when the referenced node is absent', async () => {
      const timestamp = HLC.increment(HLC.create('node-a'), 1000);
      const envelope = await Effect.runPromise(
        Receipt.createEnvelope('merge', subject('actor-1'), payload(), timestamp, ['missing-parent', Receipt.GENESIS]),
      );
      const dag = DAG.ingest(DAG.empty(), envelope);

      expect(DAG.linearize(dag).map((entry) => entry.hash)).toEqual([envelope.hash]);
    });

    test('linearize with concurrent branches produces deterministic order', async () => {
      const chain1 = await makeChain('actor-1', 'node-a', 3, 1000);
      const chain2 = await makeChain('actor-2', 'node-b', 3, 2000);
      const dag = DAG.ingestAll(DAG.fromReceipts(chain1), chain2);
      const linear1 = DAG.linearize(dag);
      const linear2 = DAG.linearize(dag);
      expect(linear1.map((e) => e.hash)).toEqual(linear2.map((e) => e.hash));
    });

    test('linearize breaks equal timestamps by actor id and then hash', async () => {
      const sharedTs = HLC.increment(HLC.create('same-node'), 2000);
      const actorA = await Effect.runPromise(
        Receipt.createEnvelope('op', subject('actor-a'), payload(), sharedTs, Receipt.GENESIS),
      );
      const actorB = await Effect.runPromise(
        Receipt.createEnvelope('op', subject('actor-b'), payload(), sharedTs, Receipt.GENESIS),
      );

      const sameActorFirst = await Effect.runPromise(
        Receipt.createEnvelope('op', subject('actor-a'), { ...payload(), content_hash: 'sha256:a' }, sharedTs, Receipt.GENESIS),
      );
      const sameActorSecond = await Effect.runPromise(
        Receipt.createEnvelope('op', subject('actor-a'), { ...payload(), content_hash: 'sha256:b' }, sharedTs, Receipt.GENESIS),
      );

      const dag = DAG.fromReceipts([actorB, sameActorSecond, sameActorFirst, actorA]);
      const ordered = DAG.linearize(dag).map((entry) => entry.hash);

      expect(ordered.indexOf(actorA.hash)).toBeLessThan(ordered.indexOf(actorB.hash));
      expect(ordered.indexOf(sameActorFirst.hash)).toBeLessThan(ordered.indexOf(sameActorSecond.hash));
    });

    test('linearize handles reverse actor and reverse hash tie-break insertion deterministically', async () => {
      const sharedTs = HLC.increment(HLC.create('same-node'), 3000);
      const actorZ = await Effect.runPromise(
        Receipt.createEnvelope('op', subject('actor-z'), payload(), sharedTs, Receipt.GENESIS),
      );
      const actorA = await Effect.runPromise(
        Receipt.createEnvelope('op', subject('actor-a'), payload(), sharedTs, Receipt.GENESIS),
      );
      const hashHigh = await Effect.runPromise(
        Receipt.createEnvelope('op', subject('actor-same'), { ...payload(), content_hash: 'sha256:z' }, sharedTs, Receipt.GENESIS),
      );
      const hashLow = await Effect.runPromise(
        Receipt.createEnvelope('op', subject('actor-same'), { ...payload(), content_hash: 'sha256:a' }, sharedTs, Receipt.GENESIS),
      );

      const ordered = DAG.linearize(DAG.fromReceipts([actorZ, actorA, hashHigh, hashLow])).map((entry) => entry.hash);

      expect(ordered.indexOf(actorA.hash)).toBeLessThan(ordered.indexOf(actorZ.hash));
      expect(ordered.indexOf(hashLow.hash)).toBeLessThan(ordered.indexOf(hashHigh.hash));
    });

    test('linearize compares higher hashes after lower hashes for identical actor and timestamp peers', async () => {
      const sharedTs = HLC.increment(HLC.create('same-node'), 3500);
      const first = await Effect.runPromise(
        Receipt.createEnvelope('op', subject('actor-same'), { ...payload(), content_hash: 'sha256:z' }, sharedTs, Receipt.GENESIS),
      );
      const second = await Effect.runPromise(
        Receipt.createEnvelope('op', subject('actor-same'), { ...payload(), content_hash: 'sha256:a' }, sharedTs, Receipt.GENESIS),
      );
      const [higherHash, lowerHash] = first.hash > second.hash ? [first, second] : [second, first];

      const ordered = DAG.linearize(DAG.fromReceipts([higherHash, lowerHash])).map((entry) => entry.hash);

      expect(ordered).toEqual([lowerHash.hash, higherHash.hash]);
    });

    test('linearize keeps multi-parent descendants pending until all parents are consumed and ignores missing children', async () => {
      const left = await makeChain('actor-1', 'node-a', 2, 1000);
      const right = await makeChain('actor-2', 'node-b', 2, 2000);
      const mergeTs = HLC.increment(HLC.create('node-merge'), 5000);
      const mergeEnvelope = await Effect.runPromise(
        Receipt.createEnvelope('merge', subject('actor-3'), payload(), mergeTs, [left[1]!.hash, right[1]!.hash]),
      );

      const merged = DAG.ingest(DAG.ingestAll(DAG.fromReceipts(left), right), mergeEnvelope);
      const ordered = DAG.linearize(merged).map((entry) => entry.hash);
      expect(ordered.indexOf(mergeEnvelope.hash)).toBeGreaterThan(ordered.indexOf(left[1]!.hash));
      expect(ordered.indexOf(mergeEnvelope.hash)).toBeGreaterThan(ordered.indexOf(right[1]!.hash));

      const corrupted = DAG.linearize({
        ...merged,
        nodes: new Map(
          Array.from(merged.nodes.entries()).map(([hash, node]) => [
            hash,
            hash === left[0]!.hash ? { ...node, children: [...node.children, 'missing-child'] } : node,
          ]),
        ),
      });

      expect(corrupted.map((entry) => entry.hash)).toEqual(ordered);
    });
  });

  describe('ancestry', () => {
    test('ancestors returns all transitive parents', async () => {
      const chain = await makeChain('actor-1', 'node-a', 4, 1000);
      const dag = DAG.fromReceipts(chain);
      const anc = DAG.ancestors(dag, chain[3]!.hash);
      expect(anc).toHaveLength(3);
      expect(anc).toContain(chain[0]!.hash);
      expect(anc).toContain(chain[1]!.hash);
      expect(anc).toContain(chain[2]!.hash);
    });

    test('ancestors of genesis is empty', async () => {
      const chain = await makeChain('actor-1', 'node-a', 3, 1000);
      const dag = DAG.fromReceipts(chain);
      const anc = DAG.ancestors(dag, chain[0]!.hash);
      expect(anc).toHaveLength(0);
    });

    test('ancestors returns empty for a missing node', async () => {
      const chain = await makeChain('actor-1', 'node-a', 3, 1000);
      const dag = DAG.fromReceipts(chain);
      expect(DAG.ancestors(dag, 'missing-hash')).toEqual([]);
    });

    test('ancestors ignores missing parents and repeated ancestor pushes in corrupted DAGs', async () => {
      const root = await makeChain('root-actor', 'node-root', 1, 1000);
      const left = await makeChain('left-actor', 'node-left', 1, 2000);
      const right = await makeChain('right-actor', 'node-right', 1, 3000);
      const leaf = await makeChain('leaf-actor', 'node-leaf', 1, 4000);

      const dag = {
        nodes: new Map<string, DAG.Node>([
          [root[0]!.hash, { envelope: root[0]!, parents: [], children: [left[0]!.hash, right[0]!.hash] }],
          [left[0]!.hash, { envelope: left[0]!, parents: [root[0]!.hash], children: [leaf[0]!.hash] }],
          [right[0]!.hash, { envelope: right[0]!, parents: [root[0]!.hash, root[0]!.hash], children: [leaf[0]!.hash] }],
          [
            leaf[0]!.hash,
            {
              envelope: leaf[0]!,
              parents: [left[0]!.hash, 'missing-parent', right[0]!.hash],
              children: [],
            },
          ],
        ]),
        heads: [leaf[0]!.hash],
        genesis: root[0]!.hash,
      };

      const ancestors = DAG.ancestors(dag, leaf[0]!.hash);
      expect(ancestors).toEqual(expect.arrayContaining([left[0]!.hash, right[0]!.hash, root[0]!.hash]));
      expect(ancestors).not.toContain('missing-parent');
    });

    test('isAncestor returns true for transitive parent', async () => {
      const chain = await makeChain('actor-1', 'node-a', 4, 1000);
      const dag = DAG.fromReceipts(chain);
      expect(DAG.isAncestor(dag, chain[0]!.hash, chain[3]!.hash)).toBe(true);
      expect(DAG.isAncestor(dag, chain[3]!.hash, chain[0]!.hash)).toBe(false);
    });

    test('isAncestor returns false for self', async () => {
      const chain = await makeChain('actor-1', 'node-a', 2, 1000);
      const dag = DAG.fromReceipts(chain);
      expect(DAG.isAncestor(dag, chain[0]!.hash, chain[0]!.hash)).toBe(false);
    });

    test('isAncestor returns false when the descendant node is missing from the DAG', async () => {
      const chain = await makeChain('actor-1', 'node-a', 2, 1000);
      const dag = DAG.fromReceipts(chain);

      expect(DAG.isAncestor(dag, chain[0]!.hash, 'missing-hash')).toBe(false);
    });

    test('isAncestor tolerates missing parents, duplicate queue entries, and self-parent corruption', async () => {
      const root = await makeChain('root-actor', 'node-root', 1, 1000);
      const left = await makeChain('left-actor', 'node-left', 1, 2000);
      const right = await makeChain('right-actor', 'node-right', 1, 3000);
      const self = await makeChain('self-actor', 'node-self', 1, 4000);
      const leaf = await makeChain('leaf-actor', 'node-leaf', 1, 5000);

      const dag = {
        nodes: new Map<string, DAG.Node>([
          [root[0]!.hash, { envelope: root[0]!, parents: [], children: [left[0]!.hash, right[0]!.hash] }],
          [left[0]!.hash, { envelope: left[0]!, parents: [root[0]!.hash], children: [leaf[0]!.hash] }],
          [right[0]!.hash, { envelope: right[0]!, parents: [root[0]!.hash, root[0]!.hash], children: [leaf[0]!.hash] }],
          [self[0]!.hash, { envelope: self[0]!, parents: [self[0]!.hash], children: [] }],
          [
            leaf[0]!.hash,
            {
              envelope: leaf[0]!,
              parents: [left[0]!.hash, 'missing-parent', right[0]!.hash, self[0]!.hash],
              children: [],
            },
          ],
        ]),
        heads: [leaf[0]!.hash],
        genesis: root[0]!.hash,
      };

      expect(DAG.isAncestor(dag, root[0]!.hash, leaf[0]!.hash)).toBe(true);
      expect(DAG.isAncestor(dag, 'not-present', leaf[0]!.hash)).toBe(false);
    });

    test('commonAncestor finds latest shared ancestor', async () => {
      const chain = await makeChain('actor-1', 'node-a', 3, 1000);
      const dag = DAG.fromReceipts(chain);
      const common = DAG.commonAncestor(dag, chain[1]!.hash, chain[2]!.hash);
      expect(common).toBe(chain[1]!.hash);
    });

    test('commonAncestor of same node returns that node', async () => {
      const chain = await makeChain('actor-1', 'node-a', 2, 1000);
      const dag = DAG.fromReceipts(chain);
      expect(DAG.commonAncestor(dag, chain[1]!.hash, chain[1]!.hash)).toBe(chain[1]!.hash);
    });

    test('commonAncestor returns null for disconnected histories', async () => {
      const chain1 = await makeChain('actor-1', 'node-a', 2, 1000);
      const chain2 = await makeChain('actor-2', 'node-b', 2, 2000);
      const dag = DAG.ingestAll(DAG.fromReceipts(chain1), chain2);

      expect(DAG.commonAncestor(dag, chain1[1]!.hash, chain2[1]!.hash)).toBeNull();
    });

    test('commonAncestor prefers the latest common node when multiple ancestors are shared', async () => {
      const chain = await makeChain('actor-1', 'node-a', 4, 1000);
      const mergeTs = HLC.increment(HLC.create('node-branch'), 5000);
      const branch = await Effect.runPromise(
        Receipt.createEnvelope('merge', subject('actor-2'), payload(), mergeTs, [chain[1]!.hash, chain[2]!.hash]),
      );
      const dag = DAG.ingest(DAG.fromReceipts(chain), branch);

      expect(DAG.commonAncestor(dag, chain[3]!.hash, branch.hash)).toBe(chain[2]!.hash);
    });

    test('commonAncestor keeps deterministic hash ordering when timestamps and actors tie', async () => {
      const base = await makeChain('actor-1', 'node-a', 1, 1000);
      const sharedTs = HLC.increment(HLC.create('node-a'), 2000);
      const higherHash = await Effect.runPromise(
        Receipt.createEnvelope('frame', subject('actor-1'), { payload: 'z' }, sharedTs, base[0]!.hash),
      );
      const lowerHash = await Effect.runPromise(
        Receipt.createEnvelope('frame', subject('actor-1'), { payload: 'a' }, sharedTs, base[0]!.hash),
      );

      const dag = DAG.ingestAll(DAG.fromReceipts(base), [higherHash, lowerHash]);

      expect(DAG.linearize(dag).map((entry) => entry.hash)).toEqual([
        base[0]!.hash,
        ...[higherHash.hash, lowerHash.hash].sort(),
      ]);
    });
  });

  describe('fork detection', () => {
    test('isFork detects multiple heads', async () => {
      const chain1 = await makeChain('actor-1', 'node-a', 2, 1000);
      const chain2 = await makeChain('actor-2', 'node-b', 2, 2000);
      const dag = DAG.ingestAll(DAG.fromReceipts(chain1), chain2);
      expect(DAG.isFork(dag)).toBe(true);
    });

    test('single linear chain is not a fork', async () => {
      const chain = await makeChain('actor-1', 'node-a', 3, 1000);
      const dag = DAG.fromReceipts(chain);
      expect(DAG.isFork(dag)).toBe(false);
    });

    test('getHeads returns all head envelopes', async () => {
      const chain1 = await makeChain('actor-1', 'node-a', 2, 1000);
      const chain2 = await makeChain('actor-2', 'node-b', 2, 2000);
      const dag = DAG.ingestAll(DAG.fromReceipts(chain1), chain2);
      const heads = DAG.getHeads(dag);
      expect(heads).toHaveLength(2);
      const headHashes = heads.map((e) => e.hash);
      expect(headHashes).toContain(chain1[1]!.hash);
      expect(headHashes).toContain(chain2[1]!.hash);
    });

    test('getHeads skips hashes that are no longer present in the node map', async () => {
      const chain = await makeChain('actor-1', 'node-a', 2, 1000);
      const dag = DAG.fromReceipts(chain);
      const corrupted = {
        ...dag,
        heads: [chain[1]!.hash, 'missing-head'],
      };

      expect(DAG.getHeads(corrupted)).toEqual([chain[1]]);
    });

    test('canonicalHead picks deterministic head from multiple', async () => {
      const chain1 = await makeChain('actor-1', 'node-a', 2, 1000);
      const chain2 = await makeChain('actor-2', 'node-b', 2, 2000);
      const dag = DAG.ingestAll(DAG.fromReceipts(chain1), chain2);
      const head = DAG.canonicalHead(dag);
      expect(head).not.toBeNull();
      const headHashes = [chain1[1]!.hash, chain2[1]!.hash];
      expect(headHashes).toContain(head!.hash);
    });

    test('canonicalHead returns the lone head without sorting', async () => {
      const chain = await makeChain('actor-1', 'node-a', 2, 1000);
      const dag = DAG.fromReceipts(chain);
      expect(DAG.canonicalHead(dag)?.hash).toBe(chain[1]!.hash);
    });

    test('canonicalHead returns null for empty DAG', () => {
      expect(DAG.canonicalHead(DAG.empty())).toBeNull();
    });
  });

  describe('merge', () => {
    test('merge integrates remote envelopes', async () => {
      const chain1 = await makeChain('actor-1', 'node-a', 2, 1000);
      const chain2 = await makeChain('actor-2', 'node-b', 2, 2000);
      const local = DAG.fromReceipts(chain1);
      const result = DAG.merge(local, chain2);
      expect(result.added).toHaveLength(2);
      expect(DAG.size(result.dag)).toBe(4);
    });

    test('merge with already-seen envelopes adds nothing', async () => {
      const chain = await makeChain('actor-1', 'node-a', 3, 1000);
      const dag = DAG.fromReceipts(chain);
      const result = DAG.merge(dag, chain);
      expect(result.added).toHaveLength(0);
      expect(result.forked).toBe(false);
    });

    test('checkForkRule detects same-actor fork from same parent', async () => {
      const chain = await makeChain('actor-1', 'node-a', 2, 1000);
      const dag = DAG.fromReceipts(chain);

      const forkTs = HLC.increment(HLC.create('node-a'), 3000);
      const forkEnvelope = await Effect.runPromise(
        Receipt.createEnvelope('op', subject('actor-1'), payload(), forkTs, chain[0]!.hash),
      );

      const violation = DAG.checkForkRule(dag, forkEnvelope);
      expect(violation).not.toBeNull();
      expect(violation!.actor).toBe('actor-1');
      expect(violation!.prevHash).toBe(chain[0]!.hash);
    });

    test('checkForkRule allows different actors from same parent', async () => {
      const chain = await makeChain('actor-1', 'node-a', 2, 1000);
      const dag = DAG.fromReceipts(chain);

      const otherTs = HLC.increment(HLC.create('node-b'), 3000);
      const otherEnvelope = await Effect.runPromise(
        Receipt.createEnvelope('op', subject('actor-2'), payload(), otherTs, chain[0]!.hash),
      );

      const violation = DAG.checkForkRule(dag, otherEnvelope);
      expect(violation).toBeNull();
    });

    test('checkForkRule ignores merge envelopes and missing parents', async () => {
      const chain = await makeChain('actor-1', 'node-a', 2, 1000);
      const dag = DAG.fromReceipts(chain);
      const mergeTs = HLC.increment(HLC.create('node-a'), 4000);
      const mergeEnvelope = await Effect.runPromise(
        Receipt.createEnvelope('merge', subject('actor-1'), payload(), mergeTs, [chain[1]!.hash, 'missing-parent']),
      );
      const missingParentEnvelope = await Effect.runPromise(
        Receipt.createEnvelope('op', subject('actor-1'), payload(), mergeTs, 'missing-parent'),
      );

      expect(DAG.checkForkRule(dag, mergeEnvelope)).toBeNull();
      expect(DAG.checkForkRule(dag, missingParentEnvelope)).toBeNull();
    });

    test('checkForkRule ignores genesis arrays even when the actor matches an existing branch', async () => {
      const chain = await makeChain('actor-1', 'node-a', 2, 1000);
      const dag = DAG.fromReceipts(chain);
      const mergeTs = HLC.increment(HLC.create('node-a'), 5000);
      const mergeEnvelope = await Effect.runPromise(
        Receipt.createEnvelope('merge', subject('actor-1'), payload(), mergeTs, [Receipt.GENESIS, chain[1]!.hash]),
      );

      expect(DAG.checkForkRule(dag, mergeEnvelope)).toBeNull();
    });

    test('merge throws when a same-actor fork is introduced', async () => {
      const chain = await makeChain('actor-1', 'node-a', 2, 1000);
      const dag = DAG.fromReceipts(chain);

      const forkTs = HLC.increment(HLC.create('node-a'), 3000);
      const forkEnvelope = await Effect.runPromise(
        Receipt.createEnvelope('op', subject('actor-1'), payload(), forkTs, chain[0]!.hash),
      );

      expect(() => DAG.merge(dag, [forkEnvelope])).toThrow(/Anti-fork violation/);
    });

    test('merge reports a fork when a remote history adds a competing head without violating anti-fork', async () => {
      const localChain = await makeChain('actor-1', 'node-a', 2, 1000);
      const remoteChain = await makeChain('actor-2', 'node-b', 2, 2000);

      const result = DAG.merge(DAG.fromReceipts(localChain), remoteChain);

      expect(result.added).toHaveLength(2);
      expect(result.forked).toBe(true);
      expect(DAG.getHeads(result.dag)).toHaveLength(2);
    });
  });
});
