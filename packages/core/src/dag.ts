/**
 * DAG -- receipt DAG merge and canonical linearization.
 *
 * Salvaged from `@kit/core`.
 *
 * @module
 */

import { compare as hlcCompare } from './hlc.js';
import type { ReceiptEnvelope } from './receipt.js';
import { GENESIS } from './receipt.js';

/** Single vertex in a {@link ReceiptDAG}: an envelope plus its parent and child hashes. */
export interface DAGNode {
  readonly envelope: ReceiptEnvelope;
  readonly parents: ReadonlyArray<string>;
  readonly children: ReadonlyArray<string>;
}

/**
 * Immutable snapshot of the receipt DAG: the set of known nodes, the current
 * head(s), and the genesis anchor if any.
 */
export interface ReceiptDAG {
  readonly nodes: ReadonlyMap<string, DAGNode>;
  readonly heads: ReadonlyArray<string>;
  readonly genesis: string | null;
}

/** Result of a DAG merge: the updated graph, the hashes that were newly added, and whether a fork was observed. */
export interface MergeResult {
  readonly dag: ReceiptDAG;
  readonly added: ReadonlyArray<string>;
  readonly forked: boolean;
}

/** Detail record describing a single-writer fork-rule violation. */
export interface ForkViolation {
  readonly actor: string;
  readonly prevHash: string;
  readonly existing: string;
  readonly attempted: string;
}

const parentsOf = (envelope: ReceiptEnvelope): ReadonlyArray<string> => {
  if (Array.isArray(envelope.previous)) {
    return (envelope.previous as readonly string[]).filter((p) => p !== GENESIS);
  }
  return envelope.previous === GENESIS ? [] : [envelope.previous as string];
};

const actorOf = (envelope: ReceiptEnvelope): string => envelope.subject.id;

/**
 * Create an empty receipt DAG with no nodes or heads.
 *
 * @example
 * ```ts
 * const dag = DAG.empty();
 * // dag.nodes.size === 0
 * // dag.heads.length === 0
 * ```
 */
export const empty = (): ReceiptDAG => ({
  nodes: new Map(),
  heads: [],
  genesis: null,
});

/**
 * Ingest a single receipt envelope into the DAG.
 *
 * Adds the envelope as a node, wires parent/child edges, and recalculates
 * head nodes. Idempotent -- returns the same DAG if the hash already exists.
 *
 * @example
 * ```ts
 * let dag = DAG.empty();
 * dag = DAG.ingest(dag, envelope);
 * // dag.nodes.size === 1
 * ```
 */
export const ingest = (dag: ReceiptDAG, envelope: ReceiptEnvelope): ReceiptDAG => {
  const hash = envelope.hash;
  if (dag.nodes.has(hash)) return dag;

  const parents = parentsOf(envelope);
  const newNode: DAGNode = { envelope, parents, children: [] };
  const newNodes = new Map(dag.nodes);
  newNodes.set(hash, newNode);

  for (const parentHash of parents) {
    const parentNode = newNodes.get(parentHash);
    if (parentNode) {
      newNodes.set(parentHash, { ...parentNode, children: [...parentNode.children, hash] });
    }
  }

  for (const [existingHash, existingNode] of dag.nodes) {
    if (existingNode.parents.includes(hash)) {
      const updatedNewNode = newNodes.get(hash)!;
      newNodes.set(hash, { ...updatedNewNode, children: [...updatedNewNode.children, existingHash] });
    }
  }

  const heads: string[] = [];
  for (const [h, node] of newNodes) {
    if (node.children.length === 0) heads.push(h);
  }

  const isGenesisNode =
    envelope.previous === GENESIS ||
    (Array.isArray(envelope.previous) && (envelope.previous as readonly string[]).includes(GENESIS));
  const genesis = isGenesisNode ? hash : dag.genesis;

  return { nodes: newNodes, heads, genesis };
};

/**
 * Ingest multiple receipt envelopes into the DAG in order.
 *
 * @example
 * ```ts
 * const dag = DAG.ingestAll(DAG.empty(), [envelope1, envelope2]);
 * // dag.nodes.size === 2
 * ```
 */
export const ingestAll = (dag: ReceiptDAG, envelopes: ReadonlyArray<ReceiptEnvelope>): ReceiptDAG =>
  envelopes.reduce((d, e) => ingest(d, e), dag);

/**
 * Build a DAG from an array of receipt envelopes.
 *
 * @example
 * ```ts
 * const dag = DAG.fromReceipts(envelopes);
 * // dag.nodes.size === envelopes.length
 * ```
 */
export const fromReceipts = (envelopes: ReadonlyArray<ReceiptEnvelope>): ReceiptDAG => ingestAll(empty(), envelopes);

/**
 * Check whether ingesting an envelope would violate the anti-fork rule.
 *
 * The anti-fork rule prevents a single actor from creating two children
 * of the same parent node. Returns a ForkViolation descriptor or null.
 *
 * @example
 * ```ts
 * const violation = DAG.checkForkRule(dag, envelope);
 * if (violation) {
 *   console.error(`Fork by actor ${violation.actor}`);
 * }
 * ```
 */
export const checkForkRule = (dag: ReceiptDAG, envelope: ReceiptEnvelope): ForkViolation | null => {
  if (Array.isArray(envelope.previous)) return null;

  const prevHash = envelope.previous as string;
  const actor = actorOf(envelope);
  const attemptedHash = envelope.hash;

  if (prevHash === GENESIS) return null;

  const parentNode = dag.nodes.get(prevHash);
  if (!parentNode) return null;

  for (const childHash of parentNode.children) {
    const childNode = dag.nodes.get(childHash);
    if (childNode && actorOf(childNode.envelope) === actor && childHash !== attemptedHash) {
      return { actor, prevHash, existing: childHash, attempted: attemptedHash };
    }
  }

  return null;
};

// Total ordering: HLC first (causal), then actor ID (deterministic across nodes),
// then hash (content-based last resort). Ensures identical linearization on every replica.
const tiebreak = (a: ReceiptEnvelope, b: ReceiptEnvelope): number => {
  const hlcCmp = hlcCompare(a.timestamp, b.timestamp);
  if (hlcCmp !== 0) return hlcCmp;
  const actorA = actorOf(a);
  const actorB = actorOf(b);
  if (actorA < actorB) return -1;
  if (actorA > actorB) return 1;
  return +(a.hash > b.hash) - +(a.hash < b.hash);
};

const sortedInsert = (
  arr: ReceiptEnvelope[],
  item: ReceiptEnvelope,
  cmp: (a: ReceiptEnvelope, b: ReceiptEnvelope) => number,
): void => {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (cmp(arr[mid]!, item) <= 0) lo = mid + 1;
    else hi = mid;
  }
  arr.splice(lo, 0, item);
};

/**
 * Produce a deterministic topological ordering of all envelopes in the DAG.
 *
 * Kahn's algorithm with stable ordering: sortedInsert maintains tiebreak order in the
 * ready queue, guaranteeing deterministic topological sort across replicas.
 *
 * @example
 * ```ts
 * const dag = DAG.fromReceipts(envelopes);
 * const ordered = DAG.linearize(dag);
 * // ordered is a deterministic total order of all envelopes
 * ```
 */
export const linearize = (dag: ReceiptDAG): ReadonlyArray<ReceiptEnvelope> => {
  if (dag.nodes.size === 0) return [];

  const inDegree = new Map<string, number>();
  for (const [hash, node] of dag.nodes) {
    let degree = 0;
    for (const parentHash of node.parents) {
      if (dag.nodes.has(parentHash)) degree++;
    }
    inDegree.set(hash, degree);
  }

  const ready: ReceiptEnvelope[] = [];
  for (const [hash, degree] of inDegree) {
    if (degree === 0) {
      const node = dag.nodes.get(hash)!;
      sortedInsert(ready, node.envelope, tiebreak);
    }
  }

  const result: ReceiptEnvelope[] = [];
  while (ready.length > 0) {
    const envelope = ready.shift()!;
    result.push(envelope);

    const node = dag.nodes.get(envelope.hash)!;
    for (const childHash of node.children) {
      const childDegree = inDegree.get(childHash);
      if (childDegree !== undefined) {
        const newDegree = childDegree - 1;
        inDegree.set(childHash, newDegree);
        if (newDegree === 0) {
          const childNode = dag.nodes.get(childHash)!;
          sortedInsert(ready, childNode.envelope, tiebreak);
        }
      }
    }
  }

  return result;
};

/**
 * Linearize the DAG and return only envelopes after a given hash.
 *
 * @example
 * ```ts
 * const newEntries = DAG.linearizeFrom(dag, lastSeenHash);
 * // newEntries contains only envelopes after lastSeenHash
 * ```
 */
export const linearizeFrom = (dag: ReceiptDAG, afterHash: string): ReadonlyArray<ReceiptEnvelope> => {
  const full = linearize(dag);
  const idx = full.findIndex((e) => e.hash === afterHash);
  if (idx === -1) return full;
  return full.slice(idx + 1);
};

/**
 * Get all head (childless) envelopes in the DAG.
 *
 * @example
 * ```ts
 * const heads = DAG.getHeads(dag);
 * // heads.length > 0 for non-empty DAGs
 * ```
 */
export const getHeads = (dag: ReceiptDAG): ReadonlyArray<ReceiptEnvelope> => {
  const result: ReceiptEnvelope[] = [];
  for (const hash of dag.heads) {
    const node = dag.nodes.get(hash);
    if (node) result.push(node.envelope);
  }
  return result;
};

/**
 * Get the single canonical head of the DAG via deterministic tiebreaking.
 *
 * @example
 * ```ts
 * const head = DAG.canonicalHead(dag);
 * // head is the deterministically chosen head envelope, or null if empty
 * ```
 */
export const canonicalHead = (dag: ReceiptDAG): ReceiptEnvelope | null => {
  const heads = getHeads(dag);
  if (heads.length === 0) return null;
  if (heads.length === 1) return heads[0]!;
  const sorted = [...heads].sort(tiebreak);
  return sorted[0]!;
};

/**
 * Check whether the DAG has multiple heads (i.e., is in a forked state).
 *
 * @example
 * ```ts
 * if (DAG.isFork(dag)) {
 *   console.log('DAG has diverged, needs merge');
 * }
 * ```
 */
export const isFork = (dag: ReceiptDAG): boolean => dag.heads.length > 1;

/**
 * Get all ancestor hashes of a given node (transitive parents).
 *
 * @example
 * ```ts
 * const anc = DAG.ancestors(dag, headHash);
 * // anc contains all hashes reachable by following parent edges
 * ```
 */
export const ancestors = (dag: ReceiptDAG, hash: string): ReadonlyArray<string> => {
  const visited = new Set<string>();
  const stack: string[] = [];

  const node = dag.nodes.get(hash);
  if (!node) return [];

  for (const parentHash of node.parents) {
    if (dag.nodes.has(parentHash)) stack.push(parentHash);
  }

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const currentNode = dag.nodes.get(current)!;
    for (const parentHash of currentNode.parents) {
      if (dag.nodes.has(parentHash) && !visited.has(parentHash)) stack.push(parentHash);
    }
  }

  return Array.from(visited);
};

/**
 * Check whether node `a` is an ancestor of node `b` in the DAG.
 *
 * @example
 * ```ts
 * const yes = DAG.isAncestor(dag, genesisHash, headHash);
 * // yes === true (genesis is ancestor of everything)
 * ```
 */
export const isAncestor = (dag: ReceiptDAG, a: string, b: string): boolean => {
  if (a === b) return false;
  const visited = new Set<string>();
  const queue: string[] = [];

  const nodeB = dag.nodes.get(b);
  if (!nodeB) return false;

  for (const parentHash of nodeB.parents) {
    if (dag.nodes.has(parentHash)) queue.push(parentHash);
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === a) return true;
    if (visited.has(current)) continue;
    visited.add(current);

    const currentNode = dag.nodes.get(current)!;
    for (const parentHash of currentNode.parents) {
      if (dag.nodes.has(parentHash) && !visited.has(parentHash)) queue.push(parentHash);
    }
  }

  return false;
};

/**
 * Find the latest common ancestor of two nodes in the DAG.
 *
 * @example
 * ```ts
 * const lca = DAG.commonAncestor(dag, hashA, hashB);
 * // lca is the hash of the most recent shared ancestor, or null
 * ```
 */
export const commonAncestor = (dag: ReceiptDAG, a: string, b: string): string | null => {
  if (a === b) return a;
  const ancestorsOfA = new Set<string>(ancestors(dag, a));
  ancestorsOfA.add(a);
  const ancestorsOfB = new Set<string>(ancestors(dag, b));
  ancestorsOfB.add(b);

  const common: string[] = [];
  for (const hash of ancestorsOfA) {
    if (ancestorsOfB.has(hash)) common.push(hash);
  }

  if (common.length === 0) return null;

  const linearized = linearize(dag);
  const linearOrder = new Map<string, number>();
  for (let i = 0; i < linearized.length; i++) {
    linearOrder.set(linearized[i]!.hash, i);
  }

  let bestHash: string | null = null;
  let bestOrder = -1;
  for (const hash of common) {
    const order = linearOrder.get(hash);
    if (order !== undefined && order > bestOrder) {
      bestOrder = order;
      bestHash = hash;
    }
  }

  return bestHash;
};

/**
 * Return the number of nodes in the DAG.
 *
 * @example
 * ```ts
 * const n = DAG.size(dag);
 * // n === dag.nodes.size
 * ```
 */
export const size = (dag: ReceiptDAG): number => dag.nodes.size;

/**
 * Merge remote envelopes into a local DAG, enforcing the anti-fork rule.
 *
 * Returns the updated DAG, list of newly added hashes, and whether the
 * result is forked. Throws on anti-fork violations.
 *
 * @example
 * ```ts
 * const result = DAG.merge(localDag, remoteEnvelopes);
 * // result.dag -- updated DAG
 * // result.added -- newly ingested hashes
 * // result.forked -- true if DAG has multiple heads
 * ```
 */
export const merge = (local: ReceiptDAG, remote: ReadonlyArray<ReceiptEnvelope>): MergeResult => {
  const added: string[] = [];
  let current = local;

  for (const envelope of remote) {
    if (current.nodes.has(envelope.hash)) continue;

    const violation = checkForkRule(current, envelope);
    if (violation !== null) {
      throw new Error(
        `Anti-fork violation: actor "${violation.actor}" attempted to fork from ` +
          `prev-hash "${violation.prevHash}". Existing child: "${violation.existing}", ` +
          `attempted: "${violation.attempted}" (each actor must have a single causal chain — use merge receipts to join branches).`,
      );
    }

    current = ingest(current, envelope);
    added.push(envelope.hash);
  }

  return { dag: current, added, forked: isFork(current) };
};

/**
 * DAG namespace -- receipt DAG merge and canonical linearization.
 *
 * Build, query, and merge directed acyclic graphs of receipt envelopes.
 * Supports deterministic linearization, fork detection, ancestor queries,
 * and anti-fork rule enforcement.
 *
 * @example
 * ```ts
 * import { DAG } from '@czap/core';
 *
 * const dag = DAG.fromReceipts(envelopes);
 * const ordered = DAG.linearize(dag);
 * const forked = DAG.isFork(dag);
 * const result = DAG.merge(dag, remoteEnvelopes);
 * ```
 */
export const DAG = {
  empty,
  ingest,
  ingestAll,
  fromReceipts,
  checkForkRule,
  linearize,
  linearizeFrom,
  getHeads,
  canonicalHead,
  isFork,
  ancestors,
  isAncestor,
  commonAncestor,
  size,
  merge,
};

export declare namespace DAG {
  /** Alias for {@link DAGNode}. */
  export type Node = DAGNode;
  /** Alias for {@link ReceiptDAG}. */
  export type Graph = ReceiptDAG;
  /** Alias for {@link MergeResult}. */
  export type Merge = MergeResult;
  /** Alias for {@link ForkViolation}. */
  export type Fork = ForkViolation;
}
