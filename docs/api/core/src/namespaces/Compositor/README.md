[**LiteShip**](../../../../README.md)

***

[LiteShip](../../../../modules.md) / [core/src](../../README.md) / Compositor

# Compositor

Compositor — the live merge point for every attached [Quantizer](../../interfaces/Quantizer.md).

`Compositor.create` hands back a scoped Effect that, when run inside a
`Scope`, produces a compositor bound to a [RuntimeCoordinator](../../variables/RuntimeCoordinator.md). Adding
quantizers, marking dirty flags, and emitting CSS/GLSL/ARIA outputs all flow
through the zero-allocation hot path backed by [CompositorStatePool](../../variables/CompositorStatePool.md).

## Example

```ts
import { Effect } from 'effect';
import { Compositor } from '@czap/core';

const program = Effect.scoped(Effect.gen(function* () {
  const compositor = yield* Compositor.create({ poolCapacity: 64, speculative: true });
  yield* compositor.add('viewport', viewportQuantizer);
  const state = yield* compositor.compute();
  // state.discrete.viewport === 'tablet'
  // state.outputs.css['--czap-viewport'] === 'tablet'
}));
```

## Type Aliases

- [Config](type-aliases/Config.md)
- [Shape](type-aliases/Shape.md)
