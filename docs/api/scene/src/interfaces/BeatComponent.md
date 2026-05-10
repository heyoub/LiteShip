[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [scene/src](../README.md) / BeatComponent

# Interface: BeatComponent

Defined in: scene/src/capsules/beat-binding.ts:24

Component shape for beat entities — what SyncSystem queries via `world.query('Beat')`.

## Properties

### anchorTrackId?

> `readonly` `optional` **anchorTrackId?**: `string`

Defined in: scene/src/capsules/beat-binding.ts:29

Optional pointer back to the audio source track that anchored this beat.

***

### kind

> `readonly` **kind**: `"beat"`

Defined in: scene/src/capsules/beat-binding.ts:25

***

### strength

> `readonly` **strength**: `number`

Defined in: scene/src/capsules/beat-binding.ts:27

***

### timeMs

> `readonly` **timeMs**: `number`

Defined in: scene/src/capsules/beat-binding.ts:26
