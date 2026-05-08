[**czap**](../../../README.md)

***

[czap](../../../README.md) / [scene/src](../README.md) / compileScene

# Function: compileScene()

> **compileScene**(`scene`): [`CompiledScene`](../interfaces/CompiledScene.md)

Defined in: [scene/src/compile.ts:69](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/scene/src/compile.ts#L69)

Compile a [SceneContract](../interfaces/SceneContract.md) into a pure [CompiledScene](../interfaces/CompiledScene.md)
descriptor. No world is constructed here — see [SceneRuntime](../namespaces/SceneRuntime/README.md).

If the scene declares a `beats?` field, those beat markers are
propagated unchanged onto the compiled descriptor. The runtime
spawns one Beat-tagged entity per marker before registering systems
(see SceneRuntime.build) so SyncSystem can query them on the first
tick. Asset-derived beats (BeatMarkerProjection) are wired by feeding
the projection's output into `scene.beats` ahead of compile.

## Parameters

### scene

[`SceneContract`](../interfaces/SceneContract.md)

## Returns

[`CompiledScene`](../interfaces/CompiledScene.md)
