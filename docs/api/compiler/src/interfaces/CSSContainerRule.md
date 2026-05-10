[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [compiler/src](../README.md) / CSSContainerRule

# Interface: CSSContainerRule

Defined in: [compiler/src/css.ts:36](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/compiler/src/css.ts#L36)

A `@container` at-rule grouping rules that apply at a given container query.

Produced per-state by [CSSCompiler.compile](../variables/CSSCompiler.md#compile); the container `name`
is derived from the boundary's `input` identifier.

## Properties

### name

> `readonly` **name**: `string`

Defined in: [compiler/src/css.ts:38](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/compiler/src/css.ts#L38)

Container name (sanitized from the boundary input).

***

### query

> `readonly` **query**: `string`

Defined in: [compiler/src/css.ts:40](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/compiler/src/css.ts#L40)

Condition text like `(width >= 768px)`.

***

### rules

> `readonly` **rules**: readonly [`CSSRule`](CSSRule.md)[]

Defined in: [compiler/src/css.ts:42](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/compiler/src/css.ts#L42)

Rules evaluated inside the container query.
