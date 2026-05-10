[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [astro/src](../README.md) / QuantizeProps

# Interface: QuantizeProps\<B\>

Defined in: astro/src/quantize.ts:35

Props accepted by the `Quantize` Astro component and by
[resolveInitialState](../functions/resolveInitialState.md).

## Type Parameters

### B

`B` *extends* [`Boundary.Shape`](#) = [`Boundary.Shape`](#)

## Properties

### boundary

> `readonly` **boundary**: `B`

Defined in: astro/src/quantize.ts:37

Boundary to quantize.

***

### class?

> `readonly` `optional` **class?**: `string`

Defined in: astro/src/quantize.ts:45

Extra CSS class names.

***

### fallback?

> `readonly` `optional` **fallback?**: `string`

Defined in: astro/src/quantize.ts:43

Final fallback if resolution fails.

***

### initialState?

> `readonly` `optional` **initialState?**: `string`

Defined in: astro/src/quantize.ts:41

Explicit initial state (skips resolution).

***

### quantizer?

> `readonly` `optional` **quantizer?**: [`Quantizer`](#)\<`B`\>

Defined in: astro/src/quantize.ts:39

Optional explicit quantizer definition.
