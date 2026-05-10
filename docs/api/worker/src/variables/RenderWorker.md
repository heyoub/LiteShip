[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [worker/src](../README.md) / RenderWorker

# Variable: RenderWorker

> `const` **RenderWorker**: `object`

Defined in: [worker/src/render-worker.ts:441](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/worker/src/render-worker.ts#L441)

Factory namespace for the render worker.

Call [RenderWorker.create](#create) on the main thread to mint a worker
that owns an `OffscreenCanvas` and renders `VideoFrameOutput` frames
off the main thread. Transfer control via
[RenderWorkerShape.transferCanvas](../interfaces/RenderWorkerShape.md#transfercanvas) before calling `startRender`.

## Type Declaration

### create

> `readonly` **create**: () => [`RenderWorkerShape`](../interfaces/RenderWorkerShape.md) = `_createRenderWorker`

Spin up a render worker. The worker starts idle; transfer an
`OffscreenCanvas` via
[RenderWorkerShape.transferCanvas](../interfaces/RenderWorkerShape.md#transfercanvas) before calling
`startRender`.

#### Returns

[`RenderWorkerShape`](../interfaces/RenderWorkerShape.md)

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
