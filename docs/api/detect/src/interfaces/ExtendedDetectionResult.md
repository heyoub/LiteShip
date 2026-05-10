[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [detect/src](../README.md) / ExtendedDetectionResult

# Interface: ExtendedDetectionResult

Defined in: [detect/src/detect.ts:142](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/detect/src/detect.ts#L142)

Full detection result including design and motion tiers.

Returned by [Detect.detect](../variables/Detect.md#detect). Consumers typically destructure
`{ capSet, designTier, motionTier }` and pass them to boundary evaluation
and compiler dispatch.

## Extends

- [`DetectionResult`](DetectionResult.md)

## Properties

### capabilities

> `readonly` **capabilities**: [`ExtendedDeviceCapabilities`](ExtendedDeviceCapabilities.md)

Defined in: [detect/src/detect.ts:144](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/detect/src/detect.ts#L144)

Extended capabilities (superset of `DeviceCapabilities`).

#### Overrides

[`DetectionResult`](DetectionResult.md).[`capabilities`](DetectionResult.md#capabilities)

***

### capSet

> `readonly` **capSet**: [`CapSet`](#)

Defined in: [detect/src/detect.ts:108](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/detect/src/detect.ts#L108)

Monotone set of every [CapLevel](#) at or below `tier`.

#### Inherited from

[`DetectionResult`](DetectionResult.md).[`capSet`](DetectionResult.md#capset)

***

### confidence

> `readonly` **confidence**: `number`

Defined in: [detect/src/detect.ts:110](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/detect/src/detect.ts#L110)

Heuristic confidence in `[0.5, 1]` based on how many probes succeeded.

#### Inherited from

[`DetectionResult`](DetectionResult.md).[`confidence`](DetectionResult.md#confidence)

***

### designTier

> `readonly` **designTier**: [`DesignTier`](../type-aliases/DesignTier.md)

Defined in: [detect/src/detect.ts:146](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/detect/src/detect.ts#L146)

Visual fidelity tier derived from display metadata.

***

### motionTier

> `readonly` **motionTier**: [`MotionTier`](../../../quantizer/src/type-aliases/MotionTier.md)

Defined in: [detect/src/detect.ts:148](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/detect/src/detect.ts#L148)

Motion complexity tier derived from GPU, cores, and reduced-motion.

***

### tier

> `readonly` **tier**: [`CapLevel`](#)

Defined in: [detect/src/detect.ts:106](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/detect/src/detect.ts#L106)

Highest [CapLevel](#) the device qualifies for.

#### Inherited from

[`DetectionResult`](DetectionResult.md).[`tier`](DetectionResult.md#tier)
