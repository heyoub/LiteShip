[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [worker/src](../README.md) / WorkerHostShape

# Interface: WorkerHostShape

Defined in: [worker/src/host.ts:31](https://github.com/heyoub/LiteShip/blob/main/packages/worker/src/host.ts#L31)

Host-facing surface of a worker host. Owns a compositor worker and,
optionally, a render worker created on demand via
[WorkerHostShape.attachCanvas](#attachcanvas). Returned by [WorkerHost.create](../variables/WorkerHost.md#create).

## Properties

### compositor

> `readonly` **compositor**: [`CompositorWorkerShape`](CompositorWorkerShape.md)

Defined in: [worker/src/host.ts:33](https://github.com/heyoub/LiteShip/blob/main/packages/worker/src/host.ts#L33)

The compositor worker instance.

***

### renderer

> `readonly` **renderer**: [`RenderWorkerShape`](RenderWorkerShape.md) \| `null`

Defined in: [worker/src/host.ts:36](https://github.com/heyoub/LiteShip/blob/main/packages/worker/src/host.ts#L36)

The render worker instance, or null if no canvas has been attached.

## Methods

### attachCanvas()

> **attachCanvas**(`canvas`): `void`

Defined in: [worker/src/host.ts:48](https://github.com/heyoub/LiteShip/blob/main/packages/worker/src/host.ts#L48)

Attach an HTMLCanvasElement for off-thread rendering.

Calls `canvas.transferControlToOffscreen()` and transfers the
resulting OffscreenCanvas to the render worker. A render worker
is created on demand if one does not already exist.

This can only be called once per canvas element -- the browser
does not allow transferring control multiple times.

#### Parameters

##### canvas

`HTMLCanvasElement`

#### Returns

`void`

***

### dispose()

> **dispose**(): `void`

Defined in: [worker/src/host.ts:63](https://github.com/heyoub/LiteShip/blob/main/packages/worker/src/host.ts#L63)

Dispose both workers and release all resources.

#### Returns

`void`

***

### onState()

> **onState**(`callback`): () => `void`

Defined in: [worker/src/host.ts:60](https://github.com/heyoub/LiteShip/blob/main/packages/worker/src/host.ts#L60)

Subscribe to CompositeState updates from the compositor worker.
Returns an unsubscribe function.

#### Parameters

##### callback

(`state`) => `void`

#### Returns

() => `void`

***

### startRender()

> **startRender**(`config`): `void`

Defined in: [worker/src/host.ts:51](https://github.com/heyoub/LiteShip/blob/main/packages/worker/src/host.ts#L51)

Start off-thread video rendering with the given configuration.

#### Parameters

##### config

`VideoConfig`

#### Returns

`void`

***

### stopRender()

> **stopRender**(): `void`

Defined in: [worker/src/host.ts:54](https://github.com/heyoub/LiteShip/blob/main/packages/worker/src/host.ts#L54)

Stop an in-progress off-thread render.

#### Returns

`void`
