[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [core/src](../README.md) / AVRenderer

# Variable: AVRenderer

> `const` **AVRenderer**: `object`

Defined in: [core/src/av-renderer.ts:106](https://github.com/heyoub/LiteShip/blob/main/packages/core/src/av-renderer.ts#L106)

AVRenderer — deterministic offline audio+video renderer.

Steps an [AVBridge](AVBridge.md) in lockstep with a [Compositor](Compositor.md) so every
video frame carries the exact sample offset it corresponds to. Pure clock
math — no wall-clock input, reproducible across runs.

## Type Declaration

### make

> **make**: (`config`, `compositor`, `existingBridge?`) => `AVRendererShape` = `_make`

Create a renderer bound to a compositor, optionally reusing an existing [AVBridge](AVBridge.md).

#### Parameters

##### config

`AVRenderConfig`

##### compositor

`CompositorShape`

##### existingBridge?

`AVBridgeShape`

#### Returns

`AVRendererShape`
