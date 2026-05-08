[**czap**](../../../README.md)

***

[czap](../../../README.md) / [scene/src](../README.md) / SyncSystem

# Function: SyncSystem()

> **SyncSystem**(`frameIndex`, `fps?`): `SystemShape`

Defined in: [scene/src/systems/sync.ts:30](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/scene/src/systems/sync.ts#L30)

Build a SyncSystem keyed to a frame index. Resolves the current scene
time from `frameIndex / fps`, queries the world for `Beat`-tagged
entities, picks the most recent beat at-or-before the current time,
and writes `_intensity = exp(-msSinceBeat / 250)` onto every
SyncAnchor entity.

## Parameters

### frameIndex

`number`

— current frame number, supplied by the runtime per tick

### fps?

`number` = `60`

— scene frames per second; defaults to 60 for parity with VideoSystem

## Returns

`SystemShape`
