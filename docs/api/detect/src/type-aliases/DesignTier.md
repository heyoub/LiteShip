[**czap**](../../../README.md)

***

[czap](../../../README.md) / [detect/src](../README.md) / DesignTier

# Type Alias: DesignTier

> **DesignTier** = `"minimal"` \| `"standard"` \| `"enhanced"` \| `"rich"`

Defined in: [detect/src/tiers.ts:79](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/detect/src/tiers.ts#L79)

Visual fidelity tier derived from device capabilities.

Drives the breadth of design signals the compositor emits: `minimal` is
optimized for forced-colors/low-update displays; `rich` unlocks wide-gamut
+ HDR treatments. Used orthogonally to [MotionTier](../../../quantizer/src/type-aliases/MotionTier.md).
