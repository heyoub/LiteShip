[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [scene/src](../README.md) / inheritContext

# Function: inheritContext()

> **inheritContext**(`parent`, `overrides?`): [`SceneContext`](../interfaces/SceneContext.md)

Defined in: [scene/src/context.ts:26](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/scene/src/context.ts#L26)

Build a child [SceneContext](../interfaces/SceneContext.md) by merging explicit overrides
over inherited parent fields. Missing override fields fall through
to the parent — explicit `undefined` is treated as "no override".

## Parameters

### parent

[`SceneContext`](../interfaces/SceneContext.md)

### overrides?

`Partial`\<[`SceneContext`](../interfaces/SceneContext.md)\>

## Returns

[`SceneContext`](../interfaces/SceneContext.md)
