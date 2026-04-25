[**czap**](../../../../README.md)

***

[czap](../../../../README.md) / [worker/src](../../README.md) / RenderWorker

# RenderWorker

Factory namespace for the render worker.

Call [RenderWorker.create](../../variables/RenderWorker.md#create) on the main thread to mint a worker
that owns an `OffscreenCanvas` and renders `VideoFrameOutput` frames
off the main thread. Transfer control via
[RenderWorkerShape.transferCanvas](../../interfaces/RenderWorkerShape.md#transfercanvas) before calling `startRender`.

## Example

```ts
import { RenderWorker } from '@czap/worker';

const renderer = RenderWorker.create();
const offscreen = canvas.transferControlToOffscreen();
renderer.transferCanvas(offscreen);
renderer.onFrame((frame) => {
  // stream frame.image / frame.timestampMs somewhere
});
renderer.startRender({ durationMs: 4000, fps: 30, width: 640, height: 360 });
```

## Type Aliases

- [Shape](type-aliases/Shape.md)
