[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [core/src](../README.md) / FrameType

# Type Alias: FrameType

> **FrameType** = `"keyframe"` \| `"delta"` \| `"interpolated"`

Defined in: core/src/gen-frame.ts:28

Classification of a [UIFrame](../interfaces/UIFrame.md) in the generative-UI pipeline, analogous to
I/P/B frames in video: `keyframe` replaces, `delta` patches, `interpolated`
keeps the DOM still and animates via CSS only.
