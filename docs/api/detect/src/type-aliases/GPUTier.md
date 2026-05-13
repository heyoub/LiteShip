[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [detect/src](../README.md) / GPUTier

# Type Alias: GPUTier

> **GPUTier** = `0` \| `1` \| `2` \| `3`

Defined in: [detect/src/detect.ts:53](https://github.com/heyoub/LiteShip/blob/main/packages/detect/src/detect.ts#L53)

Coarse GPU fidelity bucket inferred from the WebGL renderer string.

`0` = software/virtualized, `1` = integrated (Intel UHD, early Adreno),
`2` = mid-range (Adreno 5xx+, Apple M1/M2), `3` = discrete high-end
(RTX, RX 6xxx+, Apple M3+). Drives motion and design tier resolution.
