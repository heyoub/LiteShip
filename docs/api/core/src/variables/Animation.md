[**czap**](../../../README.md)

***

[czap](../../../README.md) / [core/src](../README.md) / Animation

# Variable: Animation

> `const` **Animation**: `object`

Defined in: [core/src/animation.ts:93](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/animation.ts#L93)

Animation — rAF-driven value interpolation exposed as an `Effect.Stream`.
Pairs a duration and easing with either primitive lerping or the generic
[Animation.interpolate](#interpolate) over numeric records.

## Type Declaration

### interpolate

> **interpolate**: \<`T`\>(`from`, `to`, `eased`, `defaults?`) => `T`

Shallow numeric-record interpolator; non-numeric keys pass through.

Interpolate between two numeric records using an eased value [0..1].
Returns a new record with each property lerped: from[k] + (to[k] - from[k]) * eased.

#### Type Parameters

##### T

`T` *extends* `Record`\<`string`, `number`\>

#### Parameters

##### from

`T`

##### to

`T`

##### eased

`number`

##### defaults?

`Partial`\<`Record`\<`string`, `number`\>\>

#### Returns

`T`

### run

> **run**: (`config`) => `Stream`\<`AnimationFrameShape`\> = `_run`

Run an rAF animation that yields a stream of [Animation.Frame](../namespaces/Animation/type-aliases/Frame.md).

Create a finite animation stream driven by rAF.
Emits AnimationFrame values from progress 0 to 1.

#### Parameters

##### config

###### duration

`Millis`

###### easing?

`EasingFnShape`

###### scheduler?

`SchedulerShape`

#### Returns

`Stream`\<`AnimationFrameShape`\>
