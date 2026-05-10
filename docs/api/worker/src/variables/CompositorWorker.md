[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [worker/src](../README.md) / CompositorWorker

# Variable: CompositorWorker

> `const` **CompositorWorker**: `object`

Defined in: [worker/src/compositor-worker.ts:597](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/worker/src/compositor-worker.ts#L597)

Factory namespace for the compositor worker.

Call [CompositorWorker.create](#create) on the main thread to spin up a
worker that evaluates quantizer boundaries and emits
[CompositorWorkerState](../type-aliases/CompositorWorkerState.md) snapshots. The returned
[CompositorWorkerShape](../interfaces/CompositorWorkerShape.md) owns the underlying `Worker` -- call
`dispose()` (or park via the lease pool) when finished.

## Type Declaration

### create

> `readonly` **create**: (`config?`, `startupTelemetry?`) => [`CompositorWorkerShape`](../interfaces/CompositorWorkerShape.md) = `_createCompositorWorker`

Spin up a new compositor worker. Returns immediately; the worker
posts `ready` asynchronously. Optionally provide startup telemetry
to capture per-stage timings.

#### Parameters

##### config?

[`WorkerConfig`](../interfaces/WorkerConfig.md)

##### startupTelemetry?

`CompositorWorkerStartupTelemetry`

#### Returns

[`CompositorWorkerShape`](../interfaces/CompositorWorkerShape.md)

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
