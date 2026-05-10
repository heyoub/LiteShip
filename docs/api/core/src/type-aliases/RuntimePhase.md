[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [core/src](../README.md) / RuntimePhase

# Type Alias: RuntimePhase

> **RuntimePhase** = `"compute-discrete"` \| `"compute-blend"` \| `"emit-css"` \| `"emit-glsl"` \| `"emit-aria"`

Defined in: core/src/runtime-coordinator.ts:23

Named stages of the runtime frame pass, in canonical topological order:
discrete quantization first, then blend weights, then target emitters.
