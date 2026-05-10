[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [scene/src](../README.md) / SceneContract

# Interface: SceneContract

Defined in: scene/src/contract.ts:86

Top-level scene contract — typed declaration shape for an entire composition.

## Properties

### beats?

> `readonly` `optional` **beats?**: readonly [`BeatComponent`](BeatComponent.md)[]

Defined in: scene/src/contract.ts:102

Optional pre-resolved beat markers. When present, the scene
compiler propagates them onto the [CompiledScene](CompiledScene.md) and the
runtime spawns one Beat entity per marker before systems are
registered. SyncSystem queries the world for `Beat` components
each tick to compute beat-decay intensity.

***

### bpm

> `readonly` **bpm**: `number`

Defined in: scene/src/contract.ts:90

***

### budgets

> `readonly` **budgets**: `object`

Defined in: scene/src/contract.ts:93

#### memoryMb?

> `readonly` `optional` **memoryMb?**: `number`

#### p95FrameMs

> `readonly` **p95FrameMs**: `number`

***

### duration

> `readonly` **duration**: `number`

Defined in: scene/src/contract.ts:88

***

### fps

> `readonly` **fps**: `number`

Defined in: scene/src/contract.ts:89

***

### invariants

> `readonly` **invariants**: readonly [`SceneInvariant`](SceneInvariant.md)[]

Defined in: scene/src/contract.ts:92

***

### name

> `readonly` **name**: `string`

Defined in: scene/src/contract.ts:87

***

### site

> `readonly` **site**: readonly `Site`[]

Defined in: scene/src/contract.ts:94

***

### tracks

> `readonly` **tracks**: readonly `Track`[]

Defined in: scene/src/contract.ts:91
