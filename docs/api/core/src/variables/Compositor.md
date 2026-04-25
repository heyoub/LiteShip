[**czap**](../../../README.md)

***

[czap](../../../README.md) / [core/src](../README.md) / Compositor

# Variable: Compositor

> `const` **Compositor**: `CompositorFactory`

Defined in: [core/src/compositor.ts:118](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/compositor.ts#L118)

Compositor — the live merge point for every attached [Quantizer](../interfaces/Quantizer.md).

`Compositor.create` hands back a scoped Effect that, when run inside a
`Scope`, produces a compositor bound to a [RuntimeCoordinator](RuntimeCoordinator.md). Adding
quantizers, marking dirty flags, and emitting CSS/GLSL/ARIA outputs all flow
through the zero-allocation hot path backed by [CompositorStatePool](CompositorStatePool.md).

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
