[**LiteShip**](../../../../README.md)

***

[LiteShip](../../../../modules.md) / [core/src](../../README.md) / DAG

# DAG

DAG namespace -- receipt DAG merge and canonical linearization.

Build, query, and merge directed acyclic graphs of receipt envelopes.
Supports deterministic linearization, fork detection, ancestor queries,
and anti-fork rule enforcement.

## Example

```ts
import { DAG } from '@czap/core';

const dag = DAG.fromReceipts(envelopes);
const ordered = DAG.linearize(dag);
const forked = DAG.isFork(dag);
const result = DAG.merge(dag, remoteEnvelopes);
```

## Type Aliases

- [Fork](type-aliases/Fork.md)
- [Graph](type-aliases/Graph.md)
- [Merge](type-aliases/Merge.md)
- [Node](type-aliases/Node.md)
