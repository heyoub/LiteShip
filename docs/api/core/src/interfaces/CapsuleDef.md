[**czap**](../../../README.md)

***

[czap](../../../README.md) / [core/src](../README.md) / CapsuleDef

# Interface: CapsuleDef\<K, In, Out, R\>

Defined in: [core/src/assembly.ts:15](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/assembly.ts#L15)

A capsule declaration plus its content-addressed id.

## Extends

- [`CapsuleContract`](CapsuleContract.md)\<`K`, `In`, `Out`, `R`\>

## Type Parameters

### K

`K` *extends* [`AssemblyKind`](../type-aliases/AssemblyKind.md)

### In

`In`

### Out

`Out`

### R

`R`

## Properties

### \_kind

> `readonly` **\_kind**: `K`

Defined in: [core/src/capsule.ts:64](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/capsule.ts#L64)

#### Inherited from

[`CapsuleContract`](CapsuleContract.md).[`_kind`](CapsuleContract.md#_kind)

***

### attribution?

> `readonly` `optional` **attribution?**: [`AttributionDecl`](AttributionDecl.md)

Defined in: [core/src/capsule.ts:73](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/capsule.ts#L73)

#### Inherited from

[`CapsuleContract`](CapsuleContract.md).[`attribution`](CapsuleContract.md#attribution)

***

### budgets

> `readonly` **budgets**: [`BudgetDecl`](BudgetDecl.md)

Defined in: [core/src/capsule.ts:71](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/capsule.ts#L71)

#### Inherited from

[`CapsuleContract`](CapsuleContract.md).[`budgets`](CapsuleContract.md#budgets)

***

### capabilities

> `readonly` **capabilities**: [`CapabilityDecl`](CapabilityDecl.md)\<`R`\>

Defined in: [core/src/capsule.ts:69](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/capsule.ts#L69)

#### Inherited from

[`CapsuleContract`](CapsuleContract.md).[`capabilities`](CapsuleContract.md#capabilities)

***

### id

> `readonly` **id**: `ContentAddress`

Defined in: [core/src/assembly.ts:17](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/assembly.ts#L17)

#### Overrides

[`CapsuleContract`](CapsuleContract.md).[`id`](CapsuleContract.md#id)

***

### input

> `readonly` **input**: `Schema`\<`In`\>

Defined in: [core/src/capsule.ts:67](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/capsule.ts#L67)

#### Inherited from

[`CapsuleContract`](CapsuleContract.md).[`input`](CapsuleContract.md#input)

***

### invariants

> `readonly` **invariants**: readonly [`Invariant`](Invariant.md)\<`In`, `Out`\>[]

Defined in: [core/src/capsule.ts:70](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/capsule.ts#L70)

#### Inherited from

[`CapsuleContract`](CapsuleContract.md).[`invariants`](CapsuleContract.md#invariants)

***

### name

> `readonly` **name**: `string`

Defined in: [core/src/capsule.ts:66](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/capsule.ts#L66)

#### Inherited from

[`CapsuleContract`](CapsuleContract.md).[`name`](CapsuleContract.md#name)

***

### output

> `readonly` **output**: `Schema`\<`Out`\>

Defined in: [core/src/capsule.ts:68](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/capsule.ts#L68)

#### Inherited from

[`CapsuleContract`](CapsuleContract.md).[`output`](CapsuleContract.md#output)

***

### run?

> `readonly` `optional` **run?**: (`input`) => `Out`

Defined in: [core/src/capsule.ts:79](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/capsule.ts#L79)

Optional pure-transform handler: takes a decoded input and returns a
decoded output. Used by the harness to drive generated property tests
end-to-end. Only meaningful for `pureTransform` arms today.

#### Parameters

##### input

`In`

#### Returns

`Out`

#### Inherited from

[`CapsuleContract`](CapsuleContract.md).[`run`](CapsuleContract.md#run)

***

### site

> `readonly` **site**: readonly [`Site`](../type-aliases/Site.md)[]

Defined in: [core/src/capsule.ts:72](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/capsule.ts#L72)

#### Inherited from

[`CapsuleContract`](CapsuleContract.md).[`site`](CapsuleContract.md#site)
