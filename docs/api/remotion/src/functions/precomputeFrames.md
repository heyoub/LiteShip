[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [remotion/src](../README.md) / precomputeFrames

# Function: precomputeFrames()

> **precomputeFrames**(`renderer`): `Promise`\<readonly [`VideoFrameOutput`](#)[]\>

Defined in: [remotion/src/composition.ts:32](https://github.com/heyoub/LiteShip/blob/main/packages/remotion/src/composition.ts#L32)

Precompute every [VideoFrameOutput](#) from a `VideoRenderer` into
an in-memory array.

Call this once on the server (or in a Remotion `calculateMetadata`) before
rendering so compositions can index the result by frame number without
re-invoking the renderer. The returned array's length is the renderer's
total frame count.

## Parameters

### renderer

`VideoRendererShape`

A `VideoRenderer.Shape` produced by `@czap/core`.

## Returns

`Promise`\<readonly [`VideoFrameOutput`](#)[]\>

Frames in timeline order.

## Example

```ts
const frames = await precomputeFrames(renderer);
```
