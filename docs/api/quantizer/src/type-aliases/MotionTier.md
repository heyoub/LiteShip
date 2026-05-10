[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [quantizer/src](../README.md) / MotionTier

# Type Alias: MotionTier

> **MotionTier** = `_MotionTier`

Defined in: core/dist/ui-quality.d.ts:17

Motion tier — re-anchored from `@czap/_spine` (the canonical declaration
per ADR-0010). The ladder runs from lowest capability (`none`, forced by
`prefers-reduced-motion: reduce` regardless of GPU tier) to highest
(`compute`, which unlocks the Rust/WASM kernels).
