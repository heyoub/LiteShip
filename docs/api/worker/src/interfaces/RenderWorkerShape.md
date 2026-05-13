[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [worker/src](../README.md) / RenderWorkerShape

# Interface: RenderWorkerShape

Defined in: [worker/src/render-worker.ts:30](https://github.com/heyoub/LiteShip/blob/main/packages/worker/src/render-worker.ts#L30)

Host-facing surface of a render worker. Owns the underlying `Worker`
and `OffscreenCanvas` once transferred; created by
[RenderWorker.create](../variables/RenderWorker.md#create).

## Properties

### worker

> `readonly` **worker**: `Worker`

Defined in: [worker/src/render-worker.ts:32](https://github.com/heyoub/LiteShip/blob/main/packages/worker/src/render-worker.ts#L32)

The underlying Worker instance.

## Methods

### dispose()

> **dispose**(): `void`

Defined in: [worker/src/render-worker.ts:53](https://github.com/heyoub/LiteShip/blob/main/packages/worker/src/render-worker.ts#L53)

Terminate the worker and clean up resources.

#### Returns

`void`

***

### onComplete()

> **onComplete**(`callback`): () => `void`

Defined in: [worker/src/render-worker.ts:50](https://github.com/heyoub/LiteShip/blob/main/packages/worker/src/render-worker.ts#L50)

Subscribe to render completion. Returns an unsubscribe function.

#### Parameters

##### callback

(`totalFrames`) => `void`

#### Returns

() => `void`

***

### onFrame()

> **onFrame**(`callback`): () => `void`

Defined in: [worker/src/render-worker.ts:47](https://github.com/heyoub/LiteShip/blob/main/packages/worker/src/render-worker.ts#L47)

Subscribe to per-frame output. Returns an unsubscribe function.

#### Parameters

##### callback

(`output`) => `void`

#### Returns

() => `void`

***

### startRender()

> **startRender**(`config`): `void`

Defined in: [worker/src/render-worker.ts:41](https://github.com/heyoub/LiteShip/blob/main/packages/worker/src/render-worker.ts#L41)

Start rendering frames with the given video configuration.

#### Parameters

##### config

`VideoConfig`

#### Returns

`void`

***

### stopRender()

> **stopRender**(): `void`

Defined in: [worker/src/render-worker.ts:44](https://github.com/heyoub/LiteShip/blob/main/packages/worker/src/render-worker.ts#L44)

Stop an in-progress render.

#### Returns

`void`

***

### transferCanvas()

> **transferCanvas**(`canvas`): `void`

Defined in: [worker/src/render-worker.ts:38](https://github.com/heyoub/LiteShip/blob/main/packages/worker/src/render-worker.ts#L38)

Transfer an OffscreenCanvas to the worker.
The canvas must have been obtained via `canvas.transferControlToOffscreen()`.

#### Parameters

##### canvas

`OffscreenCanvas`

#### Returns

`void`
