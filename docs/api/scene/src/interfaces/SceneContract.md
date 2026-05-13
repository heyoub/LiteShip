[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [scene/src](../README.md) / SceneContract

# Interface: SceneContract

Defined in: [scene/src/contract.ts:86](https://github.com/heyoub/LiteShip/blob/main/packages/scene/src/contract.ts#L86)

Top-level scene contract — typed declaration shape for an entire composition.

## Properties

### beats?

> `readonly` `optional` **beats?**: readonly [`BeatComponent`](BeatComponent.md)[]

Defined in: [scene/src/contract.ts:102](https://github.com/heyoub/LiteShip/blob/main/packages/scene/src/contract.ts#L102)

Optional pre-resolved beat markers. When present, the scene
compiler propagates them onto the [CompiledScene](CompiledScene.md) and the
runtime spawns one Beat entity per marker before systems are
registered. SyncSystem queries the world for `Beat` components
each tick to compute beat-decay intensity.

***

### bpm

> `readonly` **bpm**: `number`

Defined in: [scene/src/contract.ts:90](https://github.com/heyoub/LiteShip/blob/main/packages/scene/src/contract.ts#L90)

***

### budgets

> `readonly` **budgets**: `object`

Defined in: [scene/src/contract.ts:93](https://github.com/heyoub/LiteShip/blob/main/packages/scene/src/contract.ts#L93)

#### memoryMb?

> `readonly` `optional` **memoryMb?**: `number`

#### p95FrameMs

> `readonly` **p95FrameMs**: `number`

***

### duration

> `readonly` **duration**: `number`

Defined in: [scene/src/contract.ts:88](https://github.com/heyoub/LiteShip/blob/main/packages/scene/src/contract.ts#L88)

***

### fps

> `readonly` **fps**: `number`

Defined in: [scene/src/contract.ts:89](https://github.com/heyoub/LiteShip/blob/main/packages/scene/src/contract.ts#L89)

***

### invariants

> `readonly` **invariants**: readonly [`SceneInvariant`](SceneInvariant.md)[]

Defined in: [scene/src/contract.ts:92](https://github.com/heyoub/LiteShip/blob/main/packages/scene/src/contract.ts#L92)

***

### name

> `readonly` **name**: `string`

Defined in: [scene/src/contract.ts:87](https://github.com/heyoub/LiteShip/blob/main/packages/scene/src/contract.ts#L87)

***

### site

> `readonly` **site**: readonly `Site`[]

Defined in: [scene/src/contract.ts:94](https://github.com/heyoub/LiteShip/blob/main/packages/scene/src/contract.ts#L94)

***

### tracks

> `readonly` **tracks**: readonly `Track`[]

Defined in: [scene/src/contract.ts:91](https://github.com/heyoub/LiteShip/blob/main/packages/scene/src/contract.ts#L91)
