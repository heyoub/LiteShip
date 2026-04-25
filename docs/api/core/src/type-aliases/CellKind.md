[**czap**](../../../README.md)

***

[czap](../../../README.md) / [core/src](../README.md) / CellKind

# Type Alias: CellKind

> **CellKind** = `"boundary"` \| `"state"` \| `"output"` \| `"signal"` \| `"transition"` \| `"timeline"` \| `"compositor"` \| `"blend"` \| `"css"` \| `"glsl"` \| `"wgsl"` \| `"aria"` \| `"ai"`

Defined in: [core/src/protocol.ts:17](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/protocol.ts#L17)

Discriminator tagging what a [CellEnvelope](../interfaces/CellEnvelope.md) carries — a boundary, a
discrete state, a target output (CSS/GLSL/WGSL/ARIA/AI), or one of the
other reactive shapes produced along the pipeline.
