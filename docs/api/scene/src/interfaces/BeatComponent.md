[**czap**](../../../README.md)

***

[czap](../../../README.md) / [scene/src](../README.md) / BeatComponent

# Interface: BeatComponent

Defined in: [scene/src/capsules/beat-binding.ts:24](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/scene/src/capsules/beat-binding.ts#L24)

Component shape for beat entities — what SyncSystem queries via `world.query('Beat')`.

## Properties

### anchorTrackId?

> `readonly` `optional` **anchorTrackId?**: `string`

Defined in: [scene/src/capsules/beat-binding.ts:29](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/scene/src/capsules/beat-binding.ts#L29)

Optional pointer back to the audio source track that anchored this beat.

***

### kind

> `readonly` **kind**: `"beat"`

Defined in: [scene/src/capsules/beat-binding.ts:25](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/scene/src/capsules/beat-binding.ts#L25)

***

### strength

> `readonly` **strength**: `number`

Defined in: [scene/src/capsules/beat-binding.ts:27](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/scene/src/capsules/beat-binding.ts#L27)

***

### timeMs

> `readonly` **timeMs**: `number`

Defined in: [scene/src/capsules/beat-binding.ts:26](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/scene/src/capsules/beat-binding.ts#L26)
