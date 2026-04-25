[**czap**](../../../../README.md)

***

[czap](../../../../README.md) / [core/src](../../README.md) / Plan

# Plan

Plan namespace -- plan IR builder for universal execution DAG.

Build, validate, and topologically sort execution plans. Plans model
computation graphs with sequential, parallel, and conditional edges.

## Example

```ts
import { Plan } from '@czap/core';

const plan = Plan.make('render-pipeline')
  .step('load', { type: 'effect' })
  .step('compile', { type: 'pure' })
  .step('emit', { type: 'effect' })
  .seq('step-1', 'step-2')
  .seq('step-2', 'step-3')
  .build();
const valid = Plan.validate(plan);
const order = Plan.topoSort(plan);
// order.sorted === ['step-1', 'step-2', 'step-3']
```

## Type Aliases

- [Builder](type-aliases/Builder.md)
- [Edge](type-aliases/Edge.md)
- [IR](type-aliases/IR.md)
- [Step](type-aliases/Step.md)
- [TopoSort](type-aliases/TopoSort.md)
- [ValidationError](type-aliases/ValidationError.md)
- [ValidationResult](type-aliases/ValidationResult.md)
