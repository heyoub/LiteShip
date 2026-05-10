[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [astro/src](../README.md) / QuantizeProps

# Interface: QuantizeProps\<B\>

Defined in: [astro/src/quantize.ts:35](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/astro/src/quantize.ts#L35)

Props accepted by the `Quantize` Astro component and by
[resolveInitialState](../functions/resolveInitialState.md).

## Type Parameters

### B

`B` *extends* [`Boundary.Shape`](#) = [`Boundary.Shape`](#)

## Properties

### boundary

> `readonly` **boundary**: `B`

Defined in: [astro/src/quantize.ts:37](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/astro/src/quantize.ts#L37)

Boundary to quantize.

***

### class?

> `readonly` `optional` **class?**: `string`

Defined in: [astro/src/quantize.ts:45](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/astro/src/quantize.ts#L45)

Extra CSS class names.

***

### fallback?

> `readonly` `optional` **fallback?**: `string`

Defined in: [astro/src/quantize.ts:43](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/astro/src/quantize.ts#L43)

Final fallback if resolution fails.

***

### initialState?

> `readonly` `optional` **initialState?**: `string`

Defined in: [astro/src/quantize.ts:41](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/astro/src/quantize.ts#L41)

Explicit initial state (skips resolution).

***

### quantizer?

> `readonly` `optional` **quantizer?**: [`Quantizer`](#)\<`B`\>

Defined in: [astro/src/quantize.ts:39](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/astro/src/quantize.ts#L39)

Optional explicit quantizer definition.
