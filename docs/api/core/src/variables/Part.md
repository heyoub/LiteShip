[**czap**](../../../README.md)

***

[czap](../../../README.md) / [core/src](../README.md) / Part

# Variable: Part

> `const` **Part**: `object` & `Record`\<`string`, `never`\>

Defined in: [core/src/ecs.ts:354](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/ecs.ts#L354)

Part namespace — factories for ECS component stores.

Currently exposes the dense `Float64Array`-backed store used for hot-path
numeric state; sparse/object-valued parts are registered ad-hoc via
[World](World.md).`addComponent`.

## Type Declaration

### dense

> **dense**: (`name`, `capacity`) => [`DenseStore`](../interfaces/DenseStore.md)

#### Parameters

##### name

`string`

##### capacity

`number`

#### Returns

[`DenseStore`](../interfaces/DenseStore.md)
