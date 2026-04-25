[**czap**](../../../../README.md)

***

[czap](../../../../README.md) / [core/src](../../README.md) / AVRenderer

# AVRenderer

AVRenderer — deterministic offline audio+video renderer.

Steps an [AVBridge](../../variables/AVBridge.md) in lockstep with a [Compositor](../../variables/Compositor.md) so every
video frame carries the exact sample offset it corresponds to. Pure clock
math — no wall-clock input, reproducible across runs.

## Type Aliases

- [Config](type-aliases/Config.md)
- [FrameOutput](type-aliases/FrameOutput.md)
- [Shape](type-aliases/Shape.md)
