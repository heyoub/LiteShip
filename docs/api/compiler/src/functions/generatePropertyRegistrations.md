[**czap**](../../../README.md)

***

[czap](../../../README.md) / [compiler/src](../README.md) / generatePropertyRegistrations

# Function: generatePropertyRegistrations()

> **generatePropertyRegistrations**(`states`): `string`

Defined in: [compiler/src/css.ts:260](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/compiler/src/css.ts#L260)

Scan all CSS values across all states and emit `@property` declarations
for properties whose values parse as numbers or colors. This enables
GPU-interpolated transitions on custom properties.

## Parameters

### states

`Record`\<`string`, `Record`\<`string`, `string`\>\>

Per-state CSS property maps to scan for custom properties

## Returns

`string`

A string of `@property` declarations, or empty string if none found

## Example

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
