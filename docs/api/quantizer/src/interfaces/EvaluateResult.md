[**czap**](../../../README.md)

***

[czap](../../../README.md) / [quantizer/src](../README.md) / EvaluateResult

# Interface: EvaluateResult\<S\>

Defined in: [quantizer/src/evaluate.ts:15](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/quantizer/src/evaluate.ts#L15)

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

Defined in: [quantizer/src/evaluate.ts:23](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/quantizer/src/evaluate.ts#L23)

Whether evaluation produced a change from `previousState`.

***

### index

> `readonly` **index**: `number`

Defined in: [quantizer/src/evaluate.ts:19](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/quantizer/src/evaluate.ts#L19)

Index of `state` within the boundary's states tuple.

***

### state

> `readonly` **state**: `S`

Defined in: [quantizer/src/evaluate.ts:17](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/quantizer/src/evaluate.ts#L17)

The resolved state literal.

***

### value

> `readonly` **value**: `number`

Defined in: [quantizer/src/evaluate.ts:21](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/quantizer/src/evaluate.ts#L21)

The input value that was evaluated.
