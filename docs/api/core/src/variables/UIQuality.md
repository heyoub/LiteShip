[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [core/src](../README.md) / UIQuality

# Variable: UIQuality

> `const` **UIQuality**: `object`

Defined in: core/src/ui-quality.ts:93

UIQuality — adaptive-bitrate-style UI fidelity gate.

Combines buffer occupancy (how far ahead the generator is) and device
[MotionTier](../type-aliases/MotionTier.md) into a composite score and maps it via [Boundary](Boundary.md)
with hysteresis to a [UIQualityTier](../type-aliases/UIQualityTier.md).

## Type Declaration

### boundary

> **boundary**: `UIQualityBoundary` = `uiQualityBoundary`

The pre-built boundary — exposed so callers can compile it to CSS/GLSL directly.

### make

> **make**: () => `UIQualityEvaluatorShape` = `_make`

Build a stateful evaluator that remembers the previous tier for hysteresis.

#### Returns

`UIQualityEvaluatorShape`
