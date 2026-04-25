[**czap**](../../../README.md)

***

[czap](../../../README.md) / [compiler/src](../README.md) / CSSCompiler

# Variable: CSSCompiler

> `const` **CSSCompiler**: `object`

Defined in: [compiler/src/css.ts:307](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/compiler/src/css.ts#L307)

CSS compiler namespace.

Compiles boundary definitions into `@container` query rules, serializes
compile results to CSS text, and generates `@property` registrations for
custom properties that enable GPU-interpolated transitions.

## Type Declaration

### compile

> **compile**: \<`B`\>(`boundary`, `states`, `selector?`) => [`CSSCompileResult`](../interfaces/CSSCompileResult.md)

Compile a boundary definition and per-state CSS property maps into
`@container` query rules.

#### Type Parameters

##### B

`B` *extends* [`Shape`](#)\<`string`, readonly \[`string`, `string`\]\>

#### Parameters

##### boundary

`B`

The boundary definition with states and thresholds

##### states

`{ readonly [S in string]?: Record<string, string> }`

Per-state CSS property maps

##### selector?

`string`

Optional CSS selector (defaults to `.czap-boundary`)

#### Returns

[`CSSCompileResult`](../interfaces/CSSCompileResult.md)

A [CSSCompileResult](../interfaces/CSSCompileResult.md) with structured rules and raw CSS text

#### Example

```ts
import { Boundary } from '@czap/core';
import { CSSCompiler } from '@czap/compiler';

const boundary = Boundary.make({
  input: 'width', states: ['sm', 'lg'] as const,
  thresholds: [0, 768],
});
const result = CSSCompiler.compile(boundary, {
  sm: { 'font-size': '14px' },
  lg: { 'font-size': '18px' },
}, '.card');
console.log(result.raw);
// @container width (width < 768px) { .card { font-size: 14px; } }
// @container width (width >= 768px) { .card { font-size: 18px; } }
```

### generatePropertyRegistrations

> **generatePropertyRegistrations**: (`states`) => `string`

Scan all CSS values across all states and emit `@property` declarations
for properties whose values parse as numbers or colors. This enables
GPU-interpolated transitions on custom properties.

#### Parameters

##### states

`Record`\<`string`, `Record`\<`string`, `string`\>\>

Per-state CSS property maps to scan for custom properties

#### Returns

`string`

A string of `@property` declarations, or empty string if none found

#### Example

```ts
import { CSSCompiler } from '@czap/compiler';

const states = {
  sm: { '--card-bg': '#ffffff', '--card-radius': '4px' },
  lg: { '--card-bg': '#f0f0f0', '--card-radius': '8px' },
};
const registrations = CSSCompiler.generatePropertyRegistrations(states);
// @property --card-bg { syntax: "<color>"; inherits: true; initial-value: transparent; }
// @property --card-radius { syntax: "<length>"; inherits: true; initial-value: 0px; }
```

### serialize

> **serialize**: (`result`) => `string`

Serialize a [CSSCompileResult](../interfaces/CSSCompileResult.md) back to valid CSS text.

#### Parameters

##### result

[`CSSCompileResult`](../interfaces/CSSCompileResult.md)

The compile result to serialize

#### Returns

`string`

A string of valid CSS text

#### Example

```ts
import { CSSCompiler } from '@czap/compiler';

const result = CSSCompiler.compile(boundary, states);
const css = CSSCompiler.serialize(result);
document.head.appendChild(
  Object.assign(document.createElement('style'), { textContent: css }),
);
```

## Example

```ts
import { Boundary } from '@czap/core';
import { CSSCompiler } from '@czap/compiler';

const boundary = Boundary.make({
  input: 'width', states: ['sm', 'lg'] as const,
  thresholds: [0, 768],
});
const result = CSSCompiler.compile(boundary, {
  sm: { '--gap': '8px' }, lg: { '--gap': '24px' },
});
const css = CSSCompiler.serialize(result);
const props = CSSCompiler.generatePropertyRegistrations({
  sm: { '--gap': '8px' }, lg: { '--gap': '24px' },
});
```
