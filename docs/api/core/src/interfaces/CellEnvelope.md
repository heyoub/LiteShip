[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [core/src](../README.md) / CellEnvelope

# Interface: CellEnvelope\<K, T\>

Defined in: core/src/protocol.ts:44

Wire-level envelope for a cell value: tagged by [CellKind](../type-aliases/CellKind.md), identified
by its content address, stamped with [CellMeta](CellMeta.md), carrying the typed
payload in `value`.

## Type Parameters

### K

`K` *extends* [`CellKind`](../type-aliases/CellKind.md) = [`CellKind`](../type-aliases/CellKind.md)

### T

`T` = `unknown`

## Properties

### id

> `readonly` **id**: `ContentAddress`

Defined in: core/src/protocol.ts:46

***

### kind

> `readonly` **kind**: `K`

Defined in: core/src/protocol.ts:45

***

### meta

> `readonly` **meta**: [`CellMeta`](CellMeta.md)

Defined in: core/src/protocol.ts:47

***

### value

> `readonly` **value**: `T`

Defined in: core/src/protocol.ts:48
