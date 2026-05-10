[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [compiler/src](../README.md) / CSSContainerRule

# Interface: CSSContainerRule

Defined in: compiler/src/css.ts:36

A `@container` at-rule grouping rules that apply at a given container query.

Produced per-state by [CSSCompiler.compile](../variables/CSSCompiler.md#compile); the container `name`
is derived from the boundary's `input` identifier.

## Properties

### name

> `readonly` **name**: `string`

Defined in: compiler/src/css.ts:38

Container name (sanitized from the boundary input).

***

### query

> `readonly` **query**: `string`

Defined in: compiler/src/css.ts:40

Condition text like `(width >= 768px)`.

***

### rules

> `readonly` **rules**: readonly [`CSSRule`](CSSRule.md)[]

Defined in: compiler/src/css.ts:42

Rules evaluated inside the container query.
