[**czap**](../../../README.md)

***

[czap](../../../README.md) / [quantizer/src](../README.md) / AnimatedQuantizer

# Variable: AnimatedQuantizer

> `const` **AnimatedQuantizer**: `object`

Defined in: [quantizer/src/animated-quantizer.ts:264](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/quantizer/src/animated-quantizer.ts#L264)

Animated quantizer namespace.

Wraps a base quantizer with transition-aware interpolation. When a boundary
crossing occurs, numeric output values are lerped over a configurable
duration and easing curve. Non-numeric values snap at the 50% mark.
The `interpolated` stream emits frames containing progress (0-1) and
the current interpolated output record.

## Type Declaration

### make

> `readonly` **make**: \<`B`\>(`quantizer`, `transitions`, `outputs?`) => `Effect`\<[`AnimatedQuantizerShape`](../interfaces/AnimatedQuantizerShape.md)\<`B`\>, `never`, `Scope`\> = `makeAnimatedQuantizer`

Wrap a quantizer with transition-aware output interpolation.

Create an animated quantizer that interpolates outputs during transitions.

Wraps an existing [Quantizer](#) and applies easing/duration-based
interpolation between old and new output values when a boundary crossing
occurs. Produces an `interpolated` stream of frames with progress and
lerped numeric outputs at ~60fps.

#### Type Parameters

##### B

`B` *extends* [`Shape`](#)\<`string`, readonly \[`string`, `string`\]\>

#### Parameters

##### quantizer

[`Quantizer`](#)\<`B`\>

The base quantizer to wrap

##### transitions

[`TransitionMap`](../interfaces/TransitionMap.md)\<`StateUnion`\<`B`\>\>

Map of state transition configs keyed by `from->to` pattern

##### outputs?

`Record`\<`string`, `Record`\<`string`, `string` \| `number`\>\>

Per-state numeric output maps for interpolation

#### Returns

`Effect`\<[`AnimatedQuantizerShape`](../interfaces/AnimatedQuantizerShape.md)\<`B`\>, `never`, `Scope`\>

An Effect yielding an [AnimatedQuantizerShape](../interfaces/AnimatedQuantizerShape.md) (scoped)

#### Example

```ts
import { Boundary } from '@czap/core';
import { Q, AnimatedQuantizer } from '@czap/quantizer';
import { Effect, Stream } from 'effect';

const boundary = Boundary.make({
  input: 'scroll', states: ['top', 'bottom'] as const,
  thresholds: [0, 500],
});
const config = Q.from(boundary).outputs({
  css: { top: { opacity: '1' }, bottom: { opacity: '0.5' } },
});
const program = Effect.scoped(Effect.gen(function* () {
  const live = yield* config.create();
  const animated = yield* AnimatedQuantizer.make(
    live,
    { '*->*': { duration: 300 } },
    { top: { opacity: 1 }, bottom: { opacity: 0.5 } },
  );
  live.evaluate(600); // triggers interpolation
  return animated;
}));
```

## Example

```ts
import { Boundary } from '@czap/core';
import { Q, AnimatedQuantizer } from '@czap/quantizer';
import { Effect } from 'effect';

const boundary = Boundary.make({
  input: 'scroll', states: ['top', 'bottom'] as const,
  thresholds: [0, 500],
});
const config = Q.from(boundary).outputs({});
const program = Effect.scoped(Effect.gen(function* () {
  const live = yield* config.create();
  const animated = yield* AnimatedQuantizer.make(
    live,
    { '*->*': { duration: 200 } },
  );
  return animated.transition; // TransitionResolver
}));
```
