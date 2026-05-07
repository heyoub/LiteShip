[**czap**](../../../README.md)

***

[czap](../../../README.md) / [quantizer/src](../README.md) / QuantizerFromOptions

# Interface: QuantizerFromOptions

Defined in: [quantizer/src/quantizer.ts:138](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/quantizer/src/quantizer.ts#L138)

Options accepted by [Q.from](../variables/Q.md#from).

`tier` gates which output targets get produced (see `TIER_TARGETS` (in `@czap/quantizer/testing`)).
`spring` enables automatic CSS `--czap-easing` injection on CSS outputs.

## Properties

### spring?

> `readonly` `optional` **spring?**: [`SpringConfig`](SpringConfig.md)

Defined in: [quantizer/src/quantizer.ts:142](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/quantizer/src/quantizer.ts#L142)

Spring config that drives CSS easing generation for CSS outputs.

***

### tier?

> `readonly` `optional` **tier?**: [`MotionTier`](../type-aliases/MotionTier.md)

Defined in: [quantizer/src/quantizer.ts:140](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/quantizer/src/quantizer.ts#L140)

MotionTier for output gating; omit to allow all targets.
