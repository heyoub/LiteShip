[**czap**](../../../README.md)

***

[czap](../../../README.md) / [core/src](../README.md) / ReceiptDAG

# Interface: ReceiptDAG

Defined in: [core/src/dag.ts:24](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/dag.ts#L24)

Immutable snapshot of the receipt DAG: the set of known nodes, the current
head(s), and the genesis anchor if any.

## Properties

### genesis

> `readonly` **genesis**: `string` \| `null`

Defined in: [core/src/dag.ts:27](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/dag.ts#L27)

***

### heads

> `readonly` **heads**: readonly `string`[]

Defined in: [core/src/dag.ts:26](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/dag.ts#L26)

***

### nodes

> `readonly` **nodes**: `ReadonlyMap`\<`string`, [`DAGNode`](DAGNode.md)\>

Defined in: [core/src/dag.ts:25](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/dag.ts#L25)
