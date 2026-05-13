[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [quantizer/src](../README.md) / Transition

# Interface: Transition\<B\>

Defined in: [quantizer/src/transition.ts:45](https://github.com/heyoub/LiteShip/blob/main/packages/quantizer/src/transition.ts#L45)

Resolver that maps a boundary crossing to its [TransitionConfig](TransitionConfig.md).

Produced by [Transition.for](../variables/Transition.md#for); consumed by [AnimatedQuantizer](../namespaces/AnimatedQuantizer/README.md)
during animation loop setup.

## Type Parameters

### B

`B` *extends* [`Boundary.Shape`](#)

## Properties

### config

> `readonly` **config**: [`TransitionMap`](TransitionMap.md)\<`StateUnion`\<`B`\>\>

Defined in: [quantizer/src/transition.ts:47](https://github.com/heyoub/LiteShip/blob/main/packages/quantizer/src/transition.ts#L47)

The raw transition map used to create this resolver.

## Methods

### getTransition()

> **getTransition**(`from`, `to`): [`TransitionConfig`](TransitionConfig.md)

Defined in: [quantizer/src/transition.ts:49](https://github.com/heyoub/LiteShip/blob/main/packages/quantizer/src/transition.ts#L49)

Resolve the transition config for a specific `from -> to` state pair.

#### Parameters

##### from

`StateUnion`\<`B`\>

##### to

`StateUnion`\<`B`\>

#### Returns

[`TransitionConfig`](TransitionConfig.md)
