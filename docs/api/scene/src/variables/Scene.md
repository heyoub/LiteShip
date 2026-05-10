[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [scene/src](../README.md) / Scene

# Variable: Scene

> `const` **Scene**: `object`

Defined in: scene/src/include.ts:23

Scene composition helpers.

## Type Declaration

### runtime

> `readonly` **runtime**: (`compiled`, `opts`) => `Promise`\<[`SceneRuntimeHandle`](../interfaces/SceneRuntimeHandle.md)\> = `SceneRuntime.build`

Build a live, tickable runtime handle from a compiled scene.
Sugar over [SceneRuntime.build](SceneRuntime.md#build) — see `./runtime.ts`.

Build a live SceneRuntime handle from a [CompiledScene](../interfaces/CompiledScene.md).

Holds an explicit [Scope](#) for the world's lifetime so the
caller controls when finalizers run. Systems are registered in the
canonical topological order — this matches ADR-0009's
ECS-as-scene-substrate discipline.

#### Parameters

##### compiled

[`CompiledScene`](../interfaces/CompiledScene.md)

##### opts?

[`SceneRuntimeOptions`](../interfaces/SceneRuntimeOptions.md) = `{}`

#### Returns

`Promise`\<[`SceneRuntimeHandle`](../interfaces/SceneRuntimeHandle.md)\>

### include()

> `readonly` **include**(`sub`, `opts`): readonly `Track`[]

Include a sub-scene's tracks with the given offset and id prefix.

#### Parameters

##### sub

[`SceneContract`](../interfaces/SceneContract.md)

##### opts

###### offset

`number`

#### Returns

readonly `Track`[]

### subscene()

> `readonly` **subscene**(`parent`, `partial`): [`SceneContract`](../interfaces/SceneContract.md)

Author a sub-scene that inherits `bpm` / `fps` from its parent.

Spec §5.4 promised compositional inheritance: when authoring a
child scene that's included into a parent, the BPM/fps should
default to the parent's so authors don't have to repeat them
(and risk drift). This helper fills the missing fields from the
parent contract; explicit fields on `partial` win.

Lightweight — no Effect Context.Tag is introduced. If/when more
threaded state appears, the merged shape is the seam to promote.

#### Parameters

##### parent

###### bpm

`number`

###### fps

`number`

##### partial

[`SceneSubscenePartial`](../type-aliases/SceneSubscenePartial.md)

#### Returns

[`SceneContract`](../interfaces/SceneContract.md)
