[**czap**](../../../../README.md)

***

[czap](../../../../README.md) / [core/src](../../README.md) / Token

# Token

Token namespace -- design token primitive for adaptive rendering.

Create named design values that vary across axes (theme, density, contrast).
Tokens are content-addressed and produce CSS custom property references.

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

## Type Aliases

- [Shape](type-aliases/Shape.md)
