[**czap**](../../../../../README.md)

***

[czap](../../../../../README.md) / [core/src](../../../README.md) / [Harness](../README.md) / generateSceneComposition

# Function: generateSceneComposition()

> **generateSceneComposition**(`cap`): [`HarnessOutput`](../interfaces/HarnessOutput.md)

Defined in: [core/src/harness/scene-composition.ts:20](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/harness/scene-composition.ts#L20)

Generate the test + bench file contents for a `sceneComposition` capsule.
Emits `it.skip` placeholders for determinism, sync, budget, and
invariant-preservation cases.

## Parameters

### cap

[`CapsuleDef`](../../../interfaces/CapsuleDef.md)\<`"sceneComposition"`, `unknown`, `unknown`, `unknown`\>

## Returns

[`HarnessOutput`](../interfaces/HarnessOutput.md)
