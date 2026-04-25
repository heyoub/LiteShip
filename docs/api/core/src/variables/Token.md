[**czap**](../../../README.md)

***

[czap](../../../README.md) / [core/src](../README.md) / Token

# Variable: Token

> `const` **Token**: `TokenFactory` & `object`

Defined in: [core/src/token.ts:128](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/token.ts#L128)

Token namespace -- design token primitive for adaptive rendering.

Create named design values that vary across axes (theme, density, contrast).
Tokens are content-addressed and produce CSS custom property references.

## Type Declaration

### cssVar

> **cssVar**: *typeof* `_cssVar`

### tap

> **tap**: *typeof* `_tap`

## Example

```ts
import { Token } from '@czap/core';

const spacing = Token.make({
  name: 'gap', category: 'spacing',
  axes: ['density'] as const,
  values: { 'compact': '4px', 'comfortable': '8px' },
  fallback: '6px',
});
const resolved = Token.tap(spacing, { density: 'compact' });
// resolved === '4px'
const cssRef = Token.cssVar(spacing);
// cssRef === 'var(--czap-gap)'
```
