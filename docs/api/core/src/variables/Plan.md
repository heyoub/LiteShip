[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [core/src](../README.md) / Plan

# Variable: Plan

> `const` **Plan**: `object`

Defined in: [core/src/plan.ts:293](https://github.com/heyoub/LiteShip/blob/main/packages/core/src/plan.ts#L293)

Plan namespace -- plan IR builder for universal execution DAG.

Build, validate, and topologically sort execution plans. Plans model
computation graphs with sequential, parallel, and conditional edges.

## Type Declaration

### make

> **make**: (`name`) => `PlanBuilder` = `_make`

Start a new fluent [Plan.Builder](../namespaces/Plan/type-aliases/Builder.md) with the given display name.

Create a new PlanBuilder with the given plan name.

Returns a fluent builder that supports chaining `.step()`, `.seq()`,
`.par()`, and `.choice()` calls. Call `.build()` to produce the PlanIR.

#### Parameters

##### name

`string`

#### Returns

`PlanBuilder`

#### Example

```ts
const plan = Plan.make('my-pipeline')
  .step('fetch', { type: 'effect' })
  .step('transform', { type: 'pure' })
  .seq('step-1', 'step-2')
  .build();
// plan.name === 'my-pipeline'
// plan.steps.length === 2
// plan.edges.length === 1
```

### topoSort

> **topoSort**: (`planIR`) => `TopoSortResult` = `_topoSort`

Kahn's-algorithm topological sort; surfaces cycle participants if the plan is not a DAG.

Topologically sort the steps of a PlanIR using Kahn's algorithm.

Returns `{ sorted }` on success. If a cycle exists, returns
`{ sorted, cycle }` where `cycle` lists the step IDs involved.

#### Parameters

##### planIR

`PlanIR`

#### Returns

`TopoSortResult`

#### Example

```ts
const plan = Plan.make('pipeline')
  .step('a', { type: 'pure' })
  .step('b', { type: 'pure' })
  .seq('step-1', 'step-2')
  .build();
const result = Plan.topoSort(plan);
// result.sorted === ['step-1', 'step-2']
```

### validate

> **validate**: (`planIR`) => `PlanValidationResult` = `_validate`

Check that every edge references a known step and that the graph is acyclic.

Validate a PlanIR for structural correctness.

Checks that all edges reference existing steps and that the graph is acyclic.
Returns `{ ok: true, plan }` on success or `{ ok: false, errors }` with
detailed validation errors.

#### Parameters

##### planIR

`PlanIR`

#### Returns

`PlanValidationResult`

#### Example

```ts
const plan = Plan.make('test').step('a', { type: 'noop' }).build();
const result = Plan.validate(plan);
// result.ok === true
// result.plan === plan
```

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
