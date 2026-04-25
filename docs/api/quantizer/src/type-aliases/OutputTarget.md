[**czap**](../../../README.md)

***

[czap](../../../README.md) / [quantizer/src](../README.md) / OutputTarget

# Type Alias: OutputTarget

> **OutputTarget** = `"css"` \| `"glsl"` \| `"wgsl"` \| `"aria"` \| `"ai"`

Defined in: [quantizer/src/quantizer.ts:60](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/quantizer/src/quantizer.ts#L60)

Compilation target for quantizer per-state outputs.

`css` emits style declarations, `glsl`/`wgsl` emit shader uniforms,
`aria` emits accessibility attributes, `ai` emits model-facing signals.
MotionTier gates which targets a device is permitted to receive; see
[TIER\_TARGETS](../variables/TIER_TARGETS.md).
