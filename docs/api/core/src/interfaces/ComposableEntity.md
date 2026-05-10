[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [core/src](../README.md) / ComposableEntity

# Interface: ComposableEntity\<T\>

Defined in: core/src/composable.ts:42

Content-addressed entity: the identity is an FNV-1a hash over its components,
so two entities with structurally equal components share the same `id`.

## Type Parameters

### T

`T` *extends* [`EntityComponents`](EntityComponents.md) = [`EntityComponents`](EntityComponents.md)

## Properties

### \_tag

> `readonly` **\_tag**: `"ComposableEntity"`

Defined in: core/src/composable.ts:45

***

### components

> `readonly` **components**: `T`

Defined in: core/src/composable.ts:44

***

### id

> `readonly` **id**: `ContentAddress`

Defined in: core/src/composable.ts:43
