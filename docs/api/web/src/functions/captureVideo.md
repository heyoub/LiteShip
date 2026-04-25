[**czap**](../../../README.md)

***

[czap](../../../README.md) / [web/src](../README.md) / captureVideo

# Function: captureVideo()

> **captureVideo**(`renderer`, `capture`, `renderFn?`): `Promise`\<`CaptureResult`\>

Defined in: [web/src/capture/pipeline.ts:51](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/web/src/capture/pipeline.ts#L51)

Capture a video from a VideoRenderer using a FrameCapture backend.

## Parameters

### renderer

`VideoRendererShape`

The VideoRenderer producing deterministic frames

### capture

`FrameCapture`

The FrameCapture implementation (WebCodecs, Remotion, etc.)

### renderFn?

[`RenderFn`](../type-aliases/RenderFn.md)

Optional custom render function for canvas rendering

## Returns

`Promise`\<`CaptureResult`\>

The finalized CaptureResult with the encoded video blob
