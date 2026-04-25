[**czap**](../../../../README.md)

***

[czap](../../../../README.md) / [worker/src](../../README.md) / WorkerHost

# WorkerHost

`WorkerHost` -- main-thread lifecycle wrapper that owns a
[CompositorWorker.Shape](../CompositorWorker/type-aliases/Shape.md) and (optionally) a
[RenderWorker.Shape](../RenderWorker/type-aliases/Shape.md), exposing a single unified surface for DOM
integration.

Typical flow:
1. `const host = WorkerHost.create({...})` on the main thread.
2. `host.attachCanvas(canvasEl)` to lazily mint a render worker and
   transfer its `OffscreenCanvas`.
3. `host.startRender(videoConfig)` / `host.stopRender()` to control
   the render loop.
4. `host.onState(cb)` to subscribe to composite state updates.
5. `host.dispose()` when the host is unmounted -- releases both
   workers and every subscription.

## Example

```ts
import { WorkerHost } from '@czap/worker';

const host = WorkerHost.create({ poolCapacity: 64 });
host.attachCanvas(canvas);
host.startRender({ durationMs: 5000, fps: 60, width: 1280, height: 720 });
const unsub = host.onState((state) => console.log(state.discrete));
// ...
unsub();
host.dispose();
```

## Type Aliases

- [Shape](type-aliases/Shape.md)
- [StartupTelemetry](type-aliases/StartupTelemetry.md)
