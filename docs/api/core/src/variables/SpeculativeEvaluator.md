[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [core/src](../README.md) / SpeculativeEvaluator

# Variable: SpeculativeEvaluator

> `const` **SpeculativeEvaluator**: `object`

Defined in: [core/src/speculative.ts:179](https://github.com/heyoub/LiteShip/blob/main/packages/core/src/speculative.ts#L179)

SpeculativeEvaluator -- threshold proximity prefetching for boundaries.
Pre-computes the next discrete state when a signal is near a threshold,
using velocity estimation and hysteresis-based prefetch windows.

## Type Declaration

### make

> **make**: \<`B`\>(`boundary`) => `SpeculativeEvaluatorShape`\<`B`\> = `_make`

Creates a speculative evaluator for a boundary that prefetches the next state
when the signal value is near a threshold and moving toward it.

#### Type Parameters

##### B

`B` *extends* [`Shape`](../namespaces/Boundary/type-aliases/Shape.md)\<`string`, readonly \[`string`, `string`\]\>

#### Parameters

##### boundary

`B`

#### Returns

`SpeculativeEvaluatorShape`\<`B`\>

#### Example

```ts
const boundary = Boundary.make({
  thresholds: [768, 1024],
  states: ['mobile', 'tablet', 'desktop'] as const,
  hysteresis: 20,
});
const spec = SpeculativeEvaluator.make(boundary);
const result = spec.evaluate(760, 2.0); // approaching 768 threshold
result.current;     // 'mobile'
result.prefetched;  // 'tablet' (pre-computed)
result.confidence;  // 0.0-1.0 likelihood of crossing
```

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
