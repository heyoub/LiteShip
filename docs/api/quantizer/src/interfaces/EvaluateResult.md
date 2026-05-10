[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [quantizer/src](../README.md) / EvaluateResult

# Interface: EvaluateResult\<S\>

Defined in: quantizer/src/evaluate.ts:15

Result of quantizing a single numeric value against a boundary.

`crossed` is true only when `previousState` was supplied and differs
from the resolved state; it is the signal consumers use to emit
transition events and route side effects.

## Type Parameters

### S

`S` *extends* `string` = `string`

## Properties

### crossed

> `readonly` **crossed**: `boolean`

Defined in: quantizer/src/evaluate.ts:23

Whether evaluation produced a change from `previousState`.

***

### index

> `readonly` **index**: `number`

Defined in: quantizer/src/evaluate.ts:19

Index of `state` within the boundary's states tuple.

***

### state

> `readonly` **state**: `S`

Defined in: quantizer/src/evaluate.ts:17

The resolved state literal.

***

### value

> `readonly` **value**: `number`

Defined in: quantizer/src/evaluate.ts:21

The input value that was evaluated.
