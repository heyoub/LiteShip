[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [scene/src](../README.md) / sceneRuntimeCapsule

# Variable: sceneRuntimeCapsule

> `const` **sceneRuntimeCapsule**: `CapsuleDef`\<`"stateMachine"`, \{ `scene`: `unknown`; \}, \{ `entitySpawnCount`: `number`; `systemsRegistered`: `number`; \}, `unknown`\>

Defined in: [scene/src/runtime.ts:59](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/scene/src/runtime.ts#L59)

The declared `scene.runtime` capsule. Registered in the module-level
catalog at import time; walked by the factory compiler. Behavior is
implemented by [SceneRuntime.build](SceneRuntime.md#build) below.
