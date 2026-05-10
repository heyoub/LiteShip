[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [core/src](../README.md) / ComposableWorld

# Variable: ComposableWorld

> `const` **ComposableWorld**: `object`

Defined in: core/src/composable.ts:315

Bridge between a raw ECS [World](World.md) and typed [ComposableEntity](../interfaces/ComposableEntity.md)
operations (`spawn`, `query`, `evaluate`) plus a thin dense-store integration.

## Type Declaration

### dense

> **dense**: (`world`) => `ComposableDenseStore` = `makeComposableDenseStore`

Build a dense-store bridge over a [World](World.md) for per-entity numeric data.

#### Parameters

##### world

`WorldShape`

#### Returns

`ComposableDenseStore`

### make

> **make**: \<`Schema`\>(`world`) => [`ComposableWorldShape`](../interfaces/ComposableWorldShape.md)\<`Schema`\> = `makeComposableWorld`

Wrap a [World](World.md) with the typed composable-entity API.

#### Type Parameters

##### Schema

`Schema` *extends* [`EntityComponents`](../interfaces/EntityComponents.md) = [`EntityComponents`](../interfaces/EntityComponents.md)

#### Parameters

##### world

`WorldShape`

#### Returns

[`ComposableWorldShape`](../interfaces/ComposableWorldShape.md)\<`Schema`\>
