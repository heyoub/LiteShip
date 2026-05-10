[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [compiler/src](../README.md) / ARIACompiler

# Variable: ARIACompiler

> `const` **ARIACompiler**: `object`

Defined in: [compiler/src/aria.ts:146](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/compiler/src/aria.ts#L146)

ARIA compiler namespace.

Compiles boundary definitions into validated ARIA attribute maps keyed by
state. Invalid attribute keys (not `aria-*` or `role`) are filtered and
trigger a diagnostic warning. Returns both the full state mapping and the
attributes for the current active state.

## Type Declaration

### compile

> **compile**: \<`B`\>(`boundary`, `states`, `currentState`) => [`ARIACompileResult`](../interfaces/ARIACompileResult.md)\<`StateUnion`\<`B`\>\>

Compile a boundary definition and per-state ARIA attribute maps into a
validated result containing the full state-to-attributes mapping and the
attributes for the current active state.

Only valid ARIA attributes (`aria-*`) and `role` are retained; all other
keys are dropped and trigger a diagnostic warning.

#### Type Parameters

##### B

`B` *extends* [`Shape`](#)\<`string`, readonly \[`string`, `string`\]\>

#### Parameters

##### boundary

`B`

The boundary definition with states

##### states

`{ [S in string]: Record<string, string> }`

Per-state ARIA attribute maps

##### currentState

`StateUnion`\<`B`\>

The currently active state

#### Returns

[`ARIACompileResult`](../interfaces/ARIACompileResult.md)\<`StateUnion`\<`B`\>\>

An [ARIACompileResult](../interfaces/ARIACompileResult.md) with validated state attributes

#### Example

```ts
import { Boundary } from '@czap/core';
import { ARIACompiler } from '@czap/compiler';

const boundary = Boundary.make({
  input: 'width', states: ['collapsed', 'expanded'] as const,
  thresholds: [0, 768],
});
const result = ARIACompiler.compile(boundary, {
  collapsed: { 'aria-expanded': 'false', 'aria-label': 'Show more' },
  expanded: { 'aria-expanded': 'true', 'aria-label': 'Show less' },
}, 'collapsed');
console.log(result.currentAttributes);
// { 'aria-expanded': 'false', 'aria-label': 'Show more' }
```

## Example

```ts
import { Boundary } from '@czap/core';
import { ARIACompiler } from '@czap/compiler';

const boundary = Boundary.make({
  input: 'width', states: ['sm', 'lg'] as const,
  thresholds: [0, 768],
});
const result = ARIACompiler.compile(boundary, {
  sm: { 'aria-hidden': 'true' },
  lg: { 'aria-hidden': 'false' },
}, 'sm');
const attrs = result.currentAttributes;
// { 'aria-hidden': 'true' }
```
