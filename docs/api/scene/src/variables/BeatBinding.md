[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [scene/src](../README.md) / BeatBinding

# Variable: BeatBinding

> `const` **BeatBinding**: `object`

Defined in: [scene/src/capsules/beat-binding.ts:116](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/scene/src/capsules/beat-binding.ts#L116)

BeatBinding namespace — pure transforms over beat markers.
Companion type namespace exposes Spawn and Component shapes (ADR-0001).

## Type Declaration

### bind

> `readonly` **bind**: (`beats`) => readonly [`BeatSpawn`](../interfaces/BeatSpawn.md)[] = `bindBeats`

Bind a list of beat markers into spawn descriptors.

Pure transform: BeatComponent[] → BeatSpawn[]. Each input beat becomes
one spawn descriptor whose `components` field is suitable for direct
use as the `Beat` component bag in `world.spawn({ Beat: ... })`.

Defensive copy of each beat — callers may freeze, mutate, or hand off
the input array; the output is a fresh, owned-by-runtime sequence.

#### Parameters

##### beats

readonly [`BeatComponent`](../interfaces/BeatComponent.md)[]

#### Returns

readonly [`BeatSpawn`](../interfaces/BeatSpawn.md)[]
