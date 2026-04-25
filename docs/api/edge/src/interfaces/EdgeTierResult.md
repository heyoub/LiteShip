[**czap**](../../../README.md)

***

[czap](../../../README.md) / [edge/src](../README.md) / EdgeTierResult

# Interface: EdgeTierResult

Defined in: [edge/src/edge-tier.ts:25](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/edge/src/edge-tier.ts#L25)

Outcome of an edge-side tier detection sweep.

All three fields use the same branded tier types as the client runtime,
so downstream boundary evaluation and output gating reuse the exact
code paths from `@czap/detect`.

## Properties

### capLevel

> `readonly` **capLevel**: [`CapLevel`](#)

Defined in: [edge/src/edge-tier.ts:27](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/edge/src/edge-tier.ts#L27)

Highest [CapLevel](#) the device qualifies for.

***

### designTier

> `readonly` **designTier**: `DesignTier`

Defined in: [edge/src/edge-tier.ts:31](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/edge/src/edge-tier.ts#L31)

Visual fidelity tier permitted for this device.

***

### motionTier

> `readonly` **motionTier**: [`MotionTier`](../../../quantizer/src/type-aliases/MotionTier.md)

Defined in: [edge/src/edge-tier.ts:29](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/edge/src/edge-tier.ts#L29)

Motion complexity tier permitted for this device.
