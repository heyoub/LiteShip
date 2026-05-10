[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [core/src](../README.md) / ReceiptDAG

# Interface: ReceiptDAG

Defined in: core/src/dag.ts:24

Immutable snapshot of the receipt DAG: the set of known nodes, the current
head(s), and the genesis anchor if any.

## Properties

### genesis

> `readonly` **genesis**: `string` \| `null`

Defined in: core/src/dag.ts:27

***

### heads

> `readonly` **heads**: readonly `string`[]

Defined in: core/src/dag.ts:26

***

### nodes

> `readonly` **nodes**: `ReadonlyMap`\<`string`, [`DAGNode`](DAGNode.md)\>

Defined in: core/src/dag.ts:25
