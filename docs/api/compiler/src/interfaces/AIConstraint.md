[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [compiler/src](../README.md) / AIConstraint

# Interface: AIConstraint

Defined in: [compiler/src/ai-manifest.ts:89](https://github.com/heyoub/LiteShip/blob/main/packages/compiler/src/ai-manifest.ts#L89)

Cross-cutting invariant declared alongside the manifest.

`condition` is opaque at the type level — hosts evaluate it in their own
constraint engine (e.g. a `Plan.Shape` predicate). `message` is what the
LLM sees when the constraint is reported as violated.

## Properties

### condition

> `readonly` **condition**: `unknown`

Defined in: [compiler/src/ai-manifest.ts:93](https://github.com/heyoub/LiteShip/blob/main/packages/compiler/src/ai-manifest.ts#L93)

Host-defined condition payload (opaque at this layer).

***

### id

> `readonly` **id**: `string`

Defined in: [compiler/src/ai-manifest.ts:91](https://github.com/heyoub/LiteShip/blob/main/packages/compiler/src/ai-manifest.ts#L91)

Stable identifier for diagnostics and citation.

***

### message

> `readonly` **message**: `string`

Defined in: [compiler/src/ai-manifest.ts:95](https://github.com/heyoub/LiteShip/blob/main/packages/compiler/src/ai-manifest.ts#L95)

Human-readable message for violation reports.
