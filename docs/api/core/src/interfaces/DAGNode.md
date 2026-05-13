[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [core/src](../README.md) / DAGNode

# Interface: DAGNode

Defined in: [core/src/dag.ts:14](https://github.com/heyoub/LiteShip/blob/main/packages/core/src/dag.ts#L14)

Single vertex in a [ReceiptDAG](ReceiptDAG.md): an envelope plus its parent and child hashes.

## Properties

### children

> `readonly` **children**: readonly `string`[]

Defined in: [core/src/dag.ts:17](https://github.com/heyoub/LiteShip/blob/main/packages/core/src/dag.ts#L17)

***

### envelope

> `readonly` **envelope**: [`ReceiptEnvelope`](ReceiptEnvelope.md)

Defined in: [core/src/dag.ts:15](https://github.com/heyoub/LiteShip/blob/main/packages/core/src/dag.ts#L15)

***

### parents

> `readonly` **parents**: readonly `string`[]

Defined in: [core/src/dag.ts:16](https://github.com/heyoub/LiteShip/blob/main/packages/core/src/dag.ts#L16)
