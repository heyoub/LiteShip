[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [quantizer/src](../README.md) / Transition

# Variable: Transition

> **Transition**: `object`

Defined in: [quantizer/src/transition.ts:45](https://github.com/heyoub/LiteShip/blob/main/packages/quantizer/src/transition.ts#L45)

Transition resolver namespace.

`Transition.for(quantizer, map)` produces a Transition that looks
up animation parameters by `from->to` state pairs. Consumed by
[AnimatedQuantizer](../namespaces/AnimatedQuantizer/README.md) for interpolation setup.

## Type Declaration

### for

> `readonly` **for**: \<`B`\>(`_quantizer`, `transitionConfig`) => [`Transition`](../interfaces/Transition.md)\<`B`\> = `createTransition`

Build a Transition resolver for the given quantizer and transition map.

Build a Transition resolver for a given quantizer and transition map.

Resolution order:
  1. Exact match: `"stateA->stateB"`
  2. Wildcard: `"*"`
  3. Fallback: instant transition (duration: 0)

#### Type Parameters

##### B

`B` *extends* [`Shape`](#)\<`string`, readonly \[`string`, `string`\]\>

#### Parameters

##### \_quantizer

[`Quantizer`](#)\<`B`\>

##### transitionConfig

[`TransitionMap`](../interfaces/TransitionMap.md)\<`StateUnion`\<`B`\>\>

#### Returns

[`Transition`](../interfaces/Transition.md)\<`B`\>
