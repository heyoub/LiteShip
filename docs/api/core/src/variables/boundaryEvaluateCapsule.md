[**czap**](../../../README.md)

***

[czap](../../../README.md) / [core/src](../README.md) / boundaryEvaluateCapsule

# Variable: boundaryEvaluateCapsule

> `const` **boundaryEvaluateCapsule**: [`CapsuleDef`](../interfaces/CapsuleDef.md)\<`"pureTransform"`, \{ `boundary`: [`Shape`](../namespaces/Boundary/type-aliases/Shape.md)\<`string`, readonly \[`string`, `string`\]\>; `input`: `number`; \}, \{ `progress`: `number`; `state`: `string`; \}, `unknown`\>

Defined in: [core/src/capsules/boundary-evaluate.ts:31](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/capsules/boundary-evaluate.ts#L31)

Declared capsule for `Boundary.evaluate`. Registered in the module-level
catalog at import time; walked by `scripts/capsule-compile.ts` during
the gauntlet's `capsule:compile` phase.
