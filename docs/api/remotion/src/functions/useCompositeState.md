[**czap**](../../../README.md)

***

[czap](../../../README.md) / [remotion/src](../README.md) / useCompositeState

# Function: useCompositeState()

> **useCompositeState**(`frames`): `CompositeState`

Defined in: [remotion/src/hooks.ts:92](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/remotion/src/hooks.ts#L92)

Remotion-aware hook that returns the `CompositeState` for the current
frame. Internally calls Remotion's `useCurrentFrame` and defers to
[stateAtFrame](stateAtFrame.md) for lookup.

## Parameters

### frames

readonly [`VideoFrameOutput`](#)[]

Precomputed frames (see [precomputeFrames](precomputeFrames.md)).

## Returns

`CompositeState`

State for the current Remotion frame.

## Example

```tsx
import { cssVarsFromState, useCompositeState } from '@czap/remotion';

function MyComposition({ frames }: { frames: VideoFrameOutput[] }) {
  const state = useCompositeState(frames);
  const vars = cssVarsFromState(state);
  return <div style={vars}>...</div>;
}
```
