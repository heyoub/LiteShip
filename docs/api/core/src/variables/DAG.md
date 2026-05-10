[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [core/src](../README.md) / DAG

# Variable: DAG

> `const` **DAG**: `object`

Defined in: core/src/dag.ts:500

DAG namespace -- receipt DAG merge and canonical linearization.

Build, query, and merge directed acyclic graphs of receipt envelopes.
Supports deterministic linearization, fork detection, ancestor queries,
and anti-fork rule enforcement.

## Type Declaration

### ancestors

> **ancestors**: (`dag`, `hash`) => readonly `string`[]

Get all ancestor hashes of a given node (transitive parents).

#### Parameters

##### dag

[`ReceiptDAG`](../interfaces/ReceiptDAG.md)

##### hash

`string`

#### Returns

readonly `string`[]

#### Example

```ts
const anc = DAG.ancestors(dag, headHash);
// anc contains all hashes reachable by following parent edges
```

### canonicalHead

> **canonicalHead**: (`dag`) => [`ReceiptEnvelope`](../interfaces/ReceiptEnvelope.md) \| `null`

Get the single canonical head of the DAG via deterministic tiebreaking.

#### Parameters

##### dag

[`ReceiptDAG`](../interfaces/ReceiptDAG.md)

#### Returns

[`ReceiptEnvelope`](../interfaces/ReceiptEnvelope.md) \| `null`

#### Example

```ts
const head = DAG.canonicalHead(dag);
// head is the deterministically chosen head envelope, or null if empty
```

### checkForkRule

> **checkForkRule**: (`dag`, `envelope`) => [`ForkViolation`](../interfaces/ForkViolation.md) \| `null`

Check whether ingesting an envelope would violate the anti-fork rule.

The anti-fork rule prevents a single actor from creating two children
of the same parent node. Returns a ForkViolation descriptor or null.

#### Parameters

##### dag

[`ReceiptDAG`](../interfaces/ReceiptDAG.md)

##### envelope

[`ReceiptEnvelope`](../interfaces/ReceiptEnvelope.md)

#### Returns

[`ForkViolation`](../interfaces/ForkViolation.md) \| `null`

#### Example

```ts
const violation = DAG.checkForkRule(dag, envelope);
if (violation) {
  console.error(`Fork by actor ${violation.actor}`);
}
```

### commonAncestor

> **commonAncestor**: (`dag`, `a`, `b`) => `string` \| `null`

Find the latest common ancestor of two nodes in the DAG.

#### Parameters

##### dag

[`ReceiptDAG`](../interfaces/ReceiptDAG.md)

##### a

`string`

##### b

`string`

#### Returns

`string` \| `null`

#### Example

```ts
const lca = DAG.commonAncestor(dag, hashA, hashB);
// lca is the hash of the most recent shared ancestor, or null
```

### empty

> **empty**: () => [`ReceiptDAG`](../interfaces/ReceiptDAG.md)

Create an empty receipt DAG with no nodes or heads.

#### Returns

[`ReceiptDAG`](../interfaces/ReceiptDAG.md)

#### Example

```ts
const dag = DAG.empty();
// dag.nodes.size === 0
// dag.heads.length === 0
```

### fromReceipts

> **fromReceipts**: (`envelopes`) => [`ReceiptDAG`](../interfaces/ReceiptDAG.md)

Build a DAG from an array of receipt envelopes.

#### Parameters

##### envelopes

readonly [`ReceiptEnvelope`](../interfaces/ReceiptEnvelope.md)[]

#### Returns

[`ReceiptDAG`](../interfaces/ReceiptDAG.md)

#### Example

```ts
const dag = DAG.fromReceipts(envelopes);
// dag.nodes.size === envelopes.length
```

### getHeads

> **getHeads**: (`dag`) => readonly [`ReceiptEnvelope`](../interfaces/ReceiptEnvelope.md)[]

Get all head (childless) envelopes in the DAG.

#### Parameters

##### dag

[`ReceiptDAG`](../interfaces/ReceiptDAG.md)

#### Returns

readonly [`ReceiptEnvelope`](../interfaces/ReceiptEnvelope.md)[]

#### Example

```ts
const heads = DAG.getHeads(dag);
// heads.length > 0 for non-empty DAGs
```

### ingest

> **ingest**: (`dag`, `envelope`) => [`ReceiptDAG`](../interfaces/ReceiptDAG.md)

Ingest a single receipt envelope into the DAG.

Adds the envelope as a node, wires parent/child edges, and recalculates
head nodes. Idempotent -- returns the same DAG if the hash already exists.

#### Parameters

##### dag

[`ReceiptDAG`](../interfaces/ReceiptDAG.md)

##### envelope

[`ReceiptEnvelope`](../interfaces/ReceiptEnvelope.md)

#### Returns

[`ReceiptDAG`](../interfaces/ReceiptDAG.md)

#### Example

```ts
let dag = DAG.empty();
dag = DAG.ingest(dag, envelope);
// dag.nodes.size === 1
```

### ingestAll

> **ingestAll**: (`dag`, `envelopes`) => [`ReceiptDAG`](../interfaces/ReceiptDAG.md)

Ingest multiple receipt envelopes into the DAG in order.

#### Parameters

##### dag

[`ReceiptDAG`](../interfaces/ReceiptDAG.md)

##### envelopes

readonly [`ReceiptEnvelope`](../interfaces/ReceiptEnvelope.md)[]

#### Returns

[`ReceiptDAG`](../interfaces/ReceiptDAG.md)

#### Example

```ts
const dag = DAG.ingestAll(DAG.empty(), [envelope1, envelope2]);
// dag.nodes.size === 2
```

### isAncestor

> **isAncestor**: (`dag`, `a`, `b`) => `boolean`

Check whether node `a` is an ancestor of node `b` in the DAG.

#### Parameters

##### dag

[`ReceiptDAG`](../interfaces/ReceiptDAG.md)

##### a

`string`

##### b

`string`

#### Returns

`boolean`

#### Example

```ts
const yes = DAG.isAncestor(dag, genesisHash, headHash);
// yes === true (genesis is ancestor of everything)
```

### isFork

> **isFork**: (`dag`) => `boolean`

Check whether the DAG has multiple heads (i.e., is in a forked state).

#### Parameters

##### dag

[`ReceiptDAG`](../interfaces/ReceiptDAG.md)

#### Returns

`boolean`

#### Example

```ts
if (DAG.isFork(dag)) {
  console.log('DAG has diverged, needs merge');
}
```

### linearize

> **linearize**: (`dag`) => readonly [`ReceiptEnvelope`](../interfaces/ReceiptEnvelope.md)[]

Produce a deterministic topological ordering of all envelopes in the DAG.

Kahn's algorithm with stable ordering: sortedInsert maintains tiebreak order in the
ready queue, guaranteeing deterministic topological sort across replicas.

#### Parameters

##### dag

[`ReceiptDAG`](../interfaces/ReceiptDAG.md)

#### Returns

readonly [`ReceiptEnvelope`](../interfaces/ReceiptEnvelope.md)[]

#### Example

```ts
const dag = DAG.fromReceipts(envelopes);
const ordered = DAG.linearize(dag);
// ordered is a deterministic total order of all envelopes
```

### linearizeFrom

> **linearizeFrom**: (`dag`, `afterHash`) => readonly [`ReceiptEnvelope`](../interfaces/ReceiptEnvelope.md)[]

Linearize the DAG and return only envelopes after a given hash.

#### Parameters

##### dag

[`ReceiptDAG`](../interfaces/ReceiptDAG.md)

##### afterHash

`string`

#### Returns

readonly [`ReceiptEnvelope`](../interfaces/ReceiptEnvelope.md)[]

#### Example

```ts
const newEntries = DAG.linearizeFrom(dag, lastSeenHash);
// newEntries contains only envelopes after lastSeenHash
```

### merge

> **merge**: (`local`, `remote`) => [`MergeResult`](../interfaces/MergeResult.md)

Merge remote envelopes into a local DAG, enforcing the anti-fork rule.

Returns the updated DAG, list of newly added hashes, and whether the
result is forked. Throws on anti-fork violations.

#### Parameters

##### local

[`ReceiptDAG`](../interfaces/ReceiptDAG.md)

##### remote

readonly [`ReceiptEnvelope`](../interfaces/ReceiptEnvelope.md)[]

#### Returns

[`MergeResult`](../interfaces/MergeResult.md)

#### Example

```ts
const result = DAG.merge(localDag, remoteEnvelopes);
// result.dag -- updated DAG
// result.added -- newly ingested hashes
// result.forked -- true if DAG has multiple heads
```

### size

> **size**: (`dag`) => `number`

Return the number of nodes in the DAG.

#### Parameters

##### dag

[`ReceiptDAG`](../interfaces/ReceiptDAG.md)

#### Returns

`number`

#### Example

```ts
const n = DAG.size(dag);
// n === dag.nodes.size
```

## Example

```ts
import { DAG } from '@czap/core';

const dag = DAG.fromReceipts(envelopes);
const ordered = DAG.linearize(dag);
const forked = DAG.isFork(dag);
const result = DAG.merge(dag, remoteEnvelopes);
```
