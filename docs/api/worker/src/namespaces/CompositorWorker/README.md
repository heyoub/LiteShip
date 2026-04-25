[**czap**](../../../../README.md)

***

[czap](../../../../README.md) / [worker/src](../../README.md) / CompositorWorker

# CompositorWorker

Factory namespace for the compositor worker.

Call [CompositorWorker.create](../../variables/CompositorWorker.md#create) on the main thread to spin up a
worker that evaluates quantizer boundaries and emits
[CompositorWorkerState](../../type-aliases/CompositorWorkerState.md) snapshots. The returned
[CompositorWorkerShape](../../interfaces/CompositorWorkerShape.md) owns the underlying `Worker` -- call
`dispose()` (or park via the lease pool) when finished.

## Example

```ts
import { CompositorWorker } from '@czap/worker';

const compositor = CompositorWorker.create({ poolCapacity: 64 });
compositor.addQuantizer('brightness', {
  id: 'boundary:brightness',
  states: ['dim', 'bright'],
  thresholds: [0.5],
});
const unsub = compositor.onState((state) => {
  // state.discrete.brightness === 'bright' | 'dim'
});
compositor.evaluate('brightness', 0.7);
compositor.requestCompute();
// ...later:
unsub();
compositor.dispose();
```

## Type Aliases

- [Shape](type-aliases/Shape.md)
- [StartupStage](type-aliases/StartupStage.md)
- [StartupTelemetry](type-aliases/StartupTelemetry.md)
