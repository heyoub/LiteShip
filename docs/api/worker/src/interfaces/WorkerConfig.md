[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [worker/src](../README.md) / WorkerConfig

# Interface: WorkerConfig

Defined in: worker/src/messages.ts:23

Tunable knobs that the main thread sends to a worker at construction time.

Omitted fields fall back to worker-local defaults chosen by
[CompositorWorker](../namespaces/CompositorWorker/README.md) / [RenderWorker](../namespaces/RenderWorker/README.md).

## Properties

### poolCapacity?

> `readonly` `optional` **poolCapacity?**: `number`

Defined in: worker/src/messages.ts:25

Maximum number of pooled `CompositeState` slots the worker may hold.

***

### targetFps?

> `readonly` `optional` **targetFps?**: `number`

Defined in: worker/src/messages.ts:27

Target frames-per-second for the render loop (affects frame pacing).
