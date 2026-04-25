[**czap**](../../../README.md)

***

[czap](../../../README.md) / [remotion/src](../README.md) / useCzapState

# Function: useCzapState()

> **useCzapState**(): `CompositeState`

Defined in: [remotion/src/composition.ts:74](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/remotion/src/composition.ts#L74)

Hook that reads the `CompositeState` for the current Remotion frame
from the nearest [Provider](Provider.md). Returns a structurally-empty state
when no provider is mounted (or it holds no frames) so callers never
crash at the boundary.

## Returns

`CompositeState`
