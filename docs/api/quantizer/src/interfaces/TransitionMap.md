[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [quantizer/src](../README.md) / TransitionMap

# Interface: TransitionMap\<_S\>

Defined in: [quantizer/src/transition.ts:32](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/quantizer/src/transition.ts#L32)

State-transition map keyed by `"from->to"` literal or `"*"` wildcard.

Lookup resolves exact keys first, then the wildcard, then falls back to
an instantaneous transition (duration: 0).

## Type Parameters

### _S

`_S` *extends* `string` = `string`

## Indexable

> \[`key`: `` `${string}->${string}` ``\]: [`TransitionConfig`](TransitionConfig.md)

Exact `"from->to"` transition key.

## Properties

### \*?

> `readonly` `optional` **\*?**: [`TransitionConfig`](TransitionConfig.md)

Defined in: [quantizer/src/transition.ts:34](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/quantizer/src/transition.ts#L34)

Wildcard fallback applied when no exact `from->to` key matches.
