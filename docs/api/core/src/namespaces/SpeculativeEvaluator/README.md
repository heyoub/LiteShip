[**LiteShip**](../../../../README.md)

***

[LiteShip](../../../../modules.md) / [core/src](../../README.md) / SpeculativeEvaluator

# SpeculativeEvaluator

SpeculativeEvaluator -- threshold proximity prefetching for boundaries.
Pre-computes the next discrete state when a signal is near a threshold,
using velocity estimation and hysteresis-based prefetch windows.

## Example

```ts
const boundary = Boundary.make({
  thresholds: [600],
  states: ['small', 'large'] as const,
});
const spec = SpeculativeEvaluator.make(boundary);
const { current, prefetched, confidence } = spec.evaluate(595, 1.5);
// current='small', prefetched='large', confidence ~0.85
```

## Type Aliases

- [Result](type-aliases/Result.md)
- [Shape](type-aliases/Shape.md)
