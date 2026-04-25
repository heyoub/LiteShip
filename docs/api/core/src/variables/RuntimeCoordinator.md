[**czap**](../../../README.md)

***

[czap](../../../README.md) / [core/src](../README.md) / RuntimeCoordinator

# Variable: RuntimeCoordinator

> `const` **RuntimeCoordinator**: `object`

Defined in: [core/src/runtime-coordinator.ts:218](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/runtime-coordinator.ts#L218)

Runtime coordinator namespace — single entry point for building the shared
[Plan](Plan.md) + ECS store bundle consumed by every host adapter.

## Type Declaration

### create

> `readonly` **create**: (`config?`) => `RuntimeCoordinatorShape` = `createRuntimeCoordinator`

Create a fresh coordinator. See [createRuntimeCoordinator](#create).

Build a fresh RuntimeCoordinator with dense backing stores and the
canonical runtime plan. Prefer [RuntimeCoordinator.create](#create), which is
the exported entry point.

#### Parameters

##### config?

[`RuntimeCoordinatorConfig`](../interfaces/RuntimeCoordinatorConfig.md)

#### Returns

`RuntimeCoordinatorShape`
