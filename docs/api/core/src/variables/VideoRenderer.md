[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [core/src](../README.md) / VideoRenderer

# Variable: VideoRenderer

> `const` **VideoRenderer**: `object`

Defined in: [core/src/video.ts:98](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/video.ts#L98)

VideoRenderer — fixed-step frame generator for deterministic offline rendering.
Drives a [Compositor](Compositor.md) at the configured fps and optionally seeks a
controllable time [Signal](Signal.md) so every frame is reproducible.

## Type Declaration

### make

> **make**: (`config`, `compositor`, `signal?`) => `VideoRendererShape` = `_make`

Create a renderer bound to the given compositor and optional seekable time signal.

Create a video renderer that produces deterministic frames from a Compositor.

Each call to `frames()` returns an async generator yielding one
`VideoFrameOutput` per frame at the configured fps/duration.

When a `signal` is provided it is seeked to each frame's timestamp before
the compositor evaluates, so quantizers that read from that signal advance
deterministically with the render clock.

#### Parameters

##### config

[`VideoConfig`](../interfaces/VideoConfig.md)

##### compositor

`CompositorShape`

##### signal?

[`Controllable`](../namespaces/Signal/type-aliases/Controllable.md)\<`number`\>

#### Returns

`VideoRendererShape`
