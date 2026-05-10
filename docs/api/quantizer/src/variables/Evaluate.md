[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [quantizer/src](../README.md) / Evaluate

# Variable: Evaluate

> `const` **Evaluate**: `object`

Defined in: quantizer/src/evaluate.ts:160

Boundary evaluation namespace.

Provides `evaluate()` for mapping a numeric value to a discrete state
via binary search over boundary thresholds with optional hysteresis
to prevent jitter at threshold edges.

## Type Declaration

### evaluate

> **evaluate**: \<`B`\>(`boundary`, `value`, `previousState?`) => [`EvaluateResult`](../interfaces/EvaluateResult.md)\<`StateUnion`\<`B`\>\>

Find which state a value maps to via binary search over sorted thresholds.
With hysteresis: if previousState is provided and the value is within the
hysteresis dead zone of a threshold, transition is suppressed.

BoundaryDef contract: `thresholds[i]` = lower bound of `states[i]`.
Binary search finds the largest index `i` where `thresholds[i] <= value`.

#### Type Parameters

##### B

`B` *extends* [`Shape`](#)\<`string`, readonly \[`string`, `string`\]\>

#### Parameters

##### boundary

`B`

The boundary definition with states and thresholds

##### value

`number`

The numeric value to evaluate

##### previousState?

`StateUnion`\<`B`\>

Optional previous state for hysteresis and crossing detection

#### Returns

[`EvaluateResult`](../interfaces/EvaluateResult.md)\<`StateUnion`\<`B`\>\>

An [EvaluateResult](../interfaces/EvaluateResult.md) with the resolved state, index, and crossing flag

#### Example

```ts
import { Boundary } from '@czap/core';
import { evaluate } from '@czap/quantizer';

const boundary = Boundary.make({
  input: 'width', states: ['sm', 'md', 'lg'] as const,
  thresholds: [0, 640, 1024], hysteresis: 20,
});
const result = evaluate(boundary, 800);
// result => { state: 'md', index: 1, value: 800, crossed: false }

const cross = evaluate(boundary, 1100, 'md');
// cross => { state: 'lg', index: 2, value: 1100, crossed: true }
```

## Example

```ts
import { Boundary } from '@czap/core';
import { Evaluate } from '@czap/quantizer';

const boundary = Boundary.make({
  input: 'width', states: ['sm', 'lg'] as const,
  thresholds: [0, 768], hysteresis: 10,
});
const r1 = Evaluate.evaluate(boundary, 500);
// r1.state => 'sm', r1.crossed => false

const r2 = Evaluate.evaluate(boundary, 900, 'sm');
// r2.state => 'lg', r2.crossed => true
```
