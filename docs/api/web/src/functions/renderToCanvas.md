[**czap**](../../../README.md)

***

[czap](../../../README.md) / [web/src](../README.md) / renderToCanvas

# Function: renderToCanvas()

> **renderToCanvas**(`state`, `canvas`, `renderFn?`): `void`

Defined in: [web/src/capture/render.ts:67](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/web/src/capture/render.ts#L67)

Render CompositeState to an OffscreenCanvas.

If no custom renderFn is provided, the default renderer applies
CSS vars from CompositeState.outputs.css as basic canvas fills.

## Parameters

### state

`CompositeState`

### canvas

`Canvas2DTarget`

### renderFn?

[`RenderFn`](../type-aliases/RenderFn.md)

## Returns

`void`
