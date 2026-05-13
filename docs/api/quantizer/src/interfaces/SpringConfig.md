[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [quantizer/src](../README.md) / SpringConfig

# Interface: SpringConfig

Defined in: [quantizer/src/quantizer.ts:119](https://github.com/heyoub/LiteShip/blob/main/packages/quantizer/src/quantizer.ts#L119)

Spring physics parameters for CSS easing auto-generation.

When a [QuantizerConfig](QuantizerConfig.md) carries a spring, its CSS outputs receive an
injected `--czap-easing` custom property derived via `Easing.springToLinearCSS`
so native `linear()` timing matches the physical spring response.

## Properties

### damping

> `readonly` **damping**: `number`

Defined in: [quantizer/src/quantizer.ts:123](https://github.com/heyoub/LiteShip/blob/main/packages/quantizer/src/quantizer.ts#L123)

Damping coefficient; higher = less oscillation.

***

### mass?

> `readonly` `optional` **mass?**: `number`

Defined in: [quantizer/src/quantizer.ts:125](https://github.com/heyoub/LiteShip/blob/main/packages/quantizer/src/quantizer.ts#L125)

Mass of the animated body; defaults to `1`.

***

### stiffness

> `readonly` **stiffness**: `number`

Defined in: [quantizer/src/quantizer.ts:121](https://github.com/heyoub/LiteShip/blob/main/packages/quantizer/src/quantizer.ts#L121)

Spring constant (force per unit displacement); higher = snappier.
