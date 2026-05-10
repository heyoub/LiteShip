[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [remotion/src](../README.md) / stateAtFrame

# Function: stateAtFrame()

> **stateAtFrame**(`frames`, `frameIndex`): `CompositeState`

Defined in: remotion/src/hooks.ts:61

Look up the `CompositeState` for a given frame index from precomputed
frames.

Clamps to valid range: negative indices return the first frame; indices
past the end return the last frame. An empty `frames` array yields a
structurally-empty `CompositeState` so callers never have to guard for
undefined output.

## Parameters

### frames

readonly [`VideoFrameOutput`](#)[]

Output of [precomputeFrames](precomputeFrames.md).

### frameIndex

`number`

Zero-based frame index (typically from Remotion's
  `useCurrentFrame`).

## Returns

`CompositeState`

The state at the clamped frame.

## Example

```ts
const state = stateAtFrame(frames, 42);
```
