[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [quantizer/src](../README.md) / SpringConfig

# Interface: SpringConfig

Defined in: [quantizer/src/quantizer.ts:113](https://github.com/heyoub/LiteShip/blob/main/packages/quantizer/src/quantizer.ts#L113)

Spring physics parameters for CSS easing auto-generation.

When a [QuantizerConfig](QuantizerConfig.md) carries a spring, its CSS outputs receive an
injected `--czap-easing` custom property derived via `Easing.springToLinearCSS`
so native `linear()` timing matches the physical spring response.

## Properties

### damping

> `readonly` **damping**: `number`

Defined in: [quantizer/src/quantizer.ts:117](https://github.com/heyoub/LiteShip/blob/main/packages/quantizer/src/quantizer.ts#L117)

Damping coefficient; higher = less oscillation.

***

### mass?

> `readonly` `optional` **mass?**: `number`

Defined in: [quantizer/src/quantizer.ts:119](https://github.com/heyoub/LiteShip/blob/main/packages/quantizer/src/quantizer.ts#L119)

Mass of the animated body; defaults to `1`.

***

### stiffness

> `readonly` **stiffness**: `number`

Defined in: [quantizer/src/quantizer.ts:115](https://github.com/heyoub/LiteShip/blob/main/packages/quantizer/src/quantizer.ts#L115)

Spring constant (force per unit displacement); higher = snappier.
