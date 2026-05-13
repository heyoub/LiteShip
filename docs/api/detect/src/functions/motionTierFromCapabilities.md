[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [detect/src](../README.md) / motionTierFromCapabilities

# Function: motionTierFromCapabilities()

> **motionTierFromCapabilities**(`caps`): `MotionTier`

Defined in: [detect/src/tiers.ts:100](https://github.com/heyoub/LiteShip/blob/main/packages/detect/src/tiers.ts#L100)

Map extended device capabilities to a motion complexity tier.
Reduced-motion &rarr; `none`; GPU tier and core count gate the upper levels;
WebGPU availability unlocks the `compute` tier.

## Parameters

### caps

[`ExtendedDeviceCapabilities`](../interfaces/ExtendedDeviceCapabilities.md)

## Returns

`MotionTier`
