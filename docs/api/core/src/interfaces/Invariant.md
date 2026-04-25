[**czap**](../../../README.md)

***

[czap](../../../README.md) / [core/src](../README.md) / Invariant

# Interface: Invariant\<In, Out\>

Defined in: [core/src/capsule.ts:40](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/capsule.ts#L40)

A typed invariant over input and output that the harness will check.

## Type Parameters

### In

`In`

### Out

`Out`

## Properties

### check

> `readonly` **check**: (`input`, `output`) => `boolean`

Defined in: [core/src/capsule.ts:42](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/capsule.ts#L42)

#### Parameters

##### input

`In`

##### output

`Out`

#### Returns

`boolean`

***

### message

> `readonly` **message**: `string`

Defined in: [core/src/capsule.ts:43](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/capsule.ts#L43)

***

### name

> `readonly` **name**: `string`

Defined in: [core/src/capsule.ts:41](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/capsule.ts#L41)
