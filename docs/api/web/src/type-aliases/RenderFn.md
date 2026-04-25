[**czap**](../../../README.md)

***

[czap](../../../README.md) / [web/src](../README.md) / RenderFn

# Type Alias: RenderFn

> **RenderFn** = (`ctx`, `state`, `canvas`) => `void`

Defined in: [web/src/capture/render.ts:29](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/web/src/capture/render.ts#L29)

Callback that paints a frame. Receives the 2D context, the composite
state for the current frame, and the canvas itself (useful for
dimension reads).

## Parameters

### ctx

`RenderContext2D`

### state

`CompositeState`

### canvas

`Canvas2DTarget`

## Returns

`void`
