[**czap**](../../../README.md)

***

[czap](../../../README.md) / [quantizer/src](../README.md) / TransitionConfig

# Interface: TransitionConfig

Defined in: [quantizer/src/transition.ts:17](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/quantizer/src/transition.ts#L17)

Per-transition animation parameters.

Used by [AnimatedQuantizer](../namespaces/AnimatedQuantizer/README.md) to drive interpolation between two
state output records. `duration` of `0` produces an instantaneous snap.

## Properties

### delay?

> `readonly` `optional` **delay?**: `Millis`

Defined in: [quantizer/src/transition.ts:23](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/quantizer/src/transition.ts#L23)

Delay before the animation begins, in milliseconds.

***

### duration

> `readonly` **duration**: `Millis`

Defined in: [quantizer/src/transition.ts:19](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/quantizer/src/transition.ts#L19)

Animation duration in milliseconds (branded via [Millis](#)).

***

### easing?

> `readonly` `optional` **easing?**: `EasingFnShape`

Defined in: [quantizer/src/transition.ts:21](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/quantizer/src/transition.ts#L21)

Easing function applied to progress; defaults to linear.
