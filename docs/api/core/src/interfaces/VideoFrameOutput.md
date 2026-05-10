[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [core/src](../README.md) / VideoFrameOutput

# Interface: VideoFrameOutput

Defined in: core/src/video.ts:34

Single frame yielded by `VideoRenderer.frames()`: frame index, timestamp,
normalized progress, and the [CompositeState](CompositeState.md) snapshot captured at that tick.

## Properties

### frame

> `readonly` **frame**: `number`

Defined in: core/src/video.ts:35

***

### progress

> `readonly` **progress**: `number`

Defined in: core/src/video.ts:37

***

### state

> `readonly` **state**: [`CompositeState`](CompositeState.md)

Defined in: core/src/video.ts:38

***

### timestamp

> `readonly` **timestamp**: `number`

Defined in: core/src/video.ts:36
