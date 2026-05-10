[**LiteShip**](../../../../README.md)

***

[LiteShip](../../../../modules.md) / [quantizer/src](../../README.md) / AnimatedQuantizer

# AnimatedQuantizer

Animated quantizer namespace.

Wraps a base quantizer with transition-aware interpolation. When a boundary
crossing occurs, numeric output values are lerped over a configurable
duration and easing curve. Non-numeric values snap at the 50% mark.
The `interpolated` stream emits frames containing progress (0-1) and
the current interpolated output record.

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

## Type Aliases

- [Shape](type-aliases/Shape.md)
