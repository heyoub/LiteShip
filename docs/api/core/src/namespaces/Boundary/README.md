[**czap**](../../../../README.md)

***

[czap](../../../../README.md) / [core/src](../../README.md) / Boundary

# Boundary

Boundary — core primitive of constraint-based adaptive rendering.

A boundary quantizes a continuous signal (viewport, scroll, audio, …) into
a discrete set of named states. Every boundary is content-addressed via
FNV-1a, supports optional hysteresis to prevent flicker at thresholds, and
can be gated by a [BoundarySpec](../../variables/BoundarySpec.md) for A/B or device-conditional activation.

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

## Type Aliases

- [Shape](type-aliases/Shape.md)
- [Spec](type-aliases/Spec.md)
