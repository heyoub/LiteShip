[**czap**](../../../README.md)

***

[czap](../../../README.md) / [core/src](../README.md) / Boundary

# Variable: Boundary

> `const` **Boundary**: `BoundaryFactory` & `object`

Defined in: [core/src/boundary.ts:235](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/boundary.ts#L235)

Boundary — core primitive of constraint-based adaptive rendering.

A boundary quantizes a continuous signal (viewport, scroll, audio, …) into
a discrete set of named states. Every boundary is content-addressed via
FNV-1a, supports optional hysteresis to prevent flicker at thresholds, and
can be gated by a [BoundarySpec](BoundarySpec.md) for A/B or device-conditional activation.

## Type Declaration

### evaluate

> **evaluate**: *typeof* `_evaluate`

### evaluateWithHysteresis

> **evaluateWithHysteresis**: *typeof* `_evaluateWithHysteresis`

### isActive

> **isActive**: *typeof* `_isActive`

## Example

```ts
import { Boundary } from '@czap/core';

const viewport = Boundary.make({
  input: 'viewport.width',
  at: [[0, 'mobile'], [640, 'tablet'], [1024, 'desktop']] as const,
  hysteresis: 16,
});
Boundary.evaluate(viewport, 800); // 'tablet'
```
