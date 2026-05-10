[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [detect/src](../README.md) / designTierFromCapabilities

# Function: designTierFromCapabilities()

> **designTierFromCapabilities**(`caps`): [`DesignTier`](../type-aliases/DesignTier.md)

Defined in: detect/src/tiers.ts:87

Map extended device capabilities to a design fidelity tier.
Forced colors / no-update screens get minimal; wide-gamut / HDR screens
get rich; standard otherwise with an enhanced middle ground.

## Parameters

### caps

[`ExtendedDeviceCapabilities`](../interfaces/ExtendedDeviceCapabilities.md)

## Returns

[`DesignTier`](../type-aliases/DesignTier.md)
