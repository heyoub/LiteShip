[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [core/src](../README.md) / Style

# Variable: Style

> `const` **Style**: `StyleFactory` & `object`

Defined in: core/src/style.ts:190

Style namespace -- adaptive style primitive for constraint-based rendering.

Bind base styles to optional boundary states with per-state overrides and
CSS transitions. Resolve to flat property maps for any given state.

## Type Declaration

### mergeLayers

> **mergeLayers**: *typeof* `_mergeLayers`

### tap

> **tap**: *typeof* `_tap`

## Example

```ts
import { Boundary, Style } from '@czap/core';

const bp = Boundary.make({ input: 'viewport.width', at: [[0, 'sm'], [768, 'lg']] });
const style = Style.make({
  boundary: bp,
  base: { properties: { 'font-size': '14px' } },
  states: { lg: { properties: { 'font-size': '18px' } } },
  transition: { duration: Millis(200) },
});
const resolved = Style.tap(style, 'lg');
// resolved === { 'font-size': '18px' }
```
