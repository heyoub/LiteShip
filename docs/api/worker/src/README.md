[**LiteShip**](../../README.md)

***

[LiteShip](../../modules.md) / worker/src

# worker/src

`@czap/worker` — **LiteShip** off-deck crew: compositor and render workers
that keep the main thread trim while boundaries and media stay live.

This package ships:

- [SPSCRing](namespaces/SPSCRing/README.md): lock-free single-producer/single-consumer ring
  backed by `SharedArrayBuffer`, used for real-time state streaming
  from a worker to the main thread.
- [CompositorWorker](namespaces/CompositorWorker/README.md): a factory that spins up a worker which
  evaluates quantizer boundaries and emits `CompositeState`.
- [RenderWorker](namespaces/RenderWorker/README.md): a factory for a worker that renders
  `VideoFrameOutput` into an `OffscreenCanvas`.
- [WorkerHost](namespaces/WorkerHost/README.md): a thin lifecycle wrapper around `Worker` with
  typed message helpers.

## SharedArrayBuffer requirements

The SPSC ring buffer uses `SharedArrayBuffer`, which requires the page
to be served with the following HTTP headers:

  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp

Workers created by this package use inline Blob URLs and do not require
separate worker entry files or bundler configuration.

## Namespaces

- [CompositorWorker](namespaces/CompositorWorker/README.md)
- [Messages](namespaces/Messages/README.md)
- [RenderWorker](namespaces/RenderWorker/README.md)
- [SPSCRing](namespaces/SPSCRing/README.md)
- [WorkerHost](namespaces/WorkerHost/README.md)

## Interfaces

- [CompositorWorkerShape](interfaces/CompositorWorkerShape.md)
- [RenderWorkerShape](interfaces/RenderWorkerShape.md)
- [SPSCRingBufferShape](interfaces/SPSCRingBufferShape.md)
- [WorkerConfig](interfaces/WorkerConfig.md)
- [WorkerHostShape](interfaces/WorkerHostShape.md)

## Type Aliases

- [CompositorWorkerState](type-aliases/CompositorWorkerState.md)
- [FromWorkerMessage](type-aliases/FromWorkerMessage.md)
- [ToWorkerMessage](type-aliases/ToWorkerMessage.md)

## Variables

- [CompositorWorker](variables/CompositorWorker.md)
- [Messages](variables/Messages.md)
- [RenderWorker](variables/RenderWorker.md)
- [SPSCRing](variables/SPSCRing.md)
- [WorkerHost](variables/WorkerHost.md)
