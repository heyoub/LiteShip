[**czap**](../../../README.md)

***

[czap](../../../README.md) / [quantizer/src](../README.md) / TIER\_TARGETS

# Variable: TIER\_TARGETS

> `const` **TIER\_TARGETS**: `Record`\<[`MotionTier`](../type-aliases/MotionTier.md), `ReadonlySet`\<[`OutputTarget`](../type-aliases/OutputTarget.md)\>\>

Defined in: [quantizer/src/quantizer.ts:75](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/quantizer/src/quantizer.ts#L75)

MotionTier → allowed [OutputTarget](../type-aliases/OutputTarget.md) set.

Higher tiers include lower-tier targets. `none` only allows ARIA; `compute`
unlocks every target including WGSL and AI signal routing. `force()` can
override this gating per-target for prototype and test scenarios.
