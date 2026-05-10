[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [core/src](../README.md) / boundaryEvaluateCapsule

# Variable: boundaryEvaluateCapsule

> `const` **boundaryEvaluateCapsule**: [`CapsuleDef`](../interfaces/CapsuleDef.md)\<`"pureTransform"`, \{ `states`: readonly `string`[]; `thresholds`: readonly `number`[]; `value`: `number`; \}, \{ `matched`: `boolean`; `state`: `string`; \}, `unknown`\>

Defined in: core/src/capsules/boundary-evaluate.ts:101

Declared capsule for `Boundary.evaluate`. Registered in the module-level
catalog at import time; walked by `scripts/capsule-compile.ts` during
the gauntlet's `capsule:compile` phase.
