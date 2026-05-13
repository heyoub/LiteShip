[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [core/src](../README.md) / MotionTier

# Type Alias: MotionTier

> **MotionTier** = `_MotionTier`

Defined in: [core/src/ui-quality.ts:19](https://github.com/heyoub/LiteShip/blob/main/packages/core/src/ui-quality.ts#L19)

Motion tier — re-anchored from `@czap/_spine` (the canonical declaration
per ADR-0010). The ladder runs from lowest capability (`none`, forced by
`prefers-reduced-motion: reduce` regardless of GPU tier) to highest
(`compute`, which unlocks the Rust/WASM kernels).
