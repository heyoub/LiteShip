[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [detect/src](../README.md) / DetectionResult

# Interface: DetectionResult

Defined in: [detect/src/detect.ts:102](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/detect/src/detect.ts#L102)

Result of a single detection sweep.

Bundles the probed capabilities together with the derived [CapLevel](#)
tier, its monotone [CapSet](#), and a confidence score reflecting how
many probes returned real values (vs. defaults).

## Extended by

- [`ExtendedDetectionResult`](ExtendedDetectionResult.md)

## Properties

### capabilities

> `readonly` **capabilities**: [`DeviceCapabilities`](DeviceCapabilities.md)

Defined in: [detect/src/detect.ts:104](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/detect/src/detect.ts#L104)

The probed capabilities.

***

### capSet

> `readonly` **capSet**: [`CapSet`](#)

Defined in: [detect/src/detect.ts:108](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/detect/src/detect.ts#L108)

Monotone set of every [CapLevel](#) at or below `tier`.

***

### confidence

> `readonly` **confidence**: `number`

Defined in: [detect/src/detect.ts:110](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/detect/src/detect.ts#L110)

Heuristic confidence in `[0.5, 1]` based on how many probes succeeded.

***

### tier

> `readonly` **tier**: [`CapLevel`](#)

Defined in: [detect/src/detect.ts:106](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/detect/src/detect.ts#L106)

Highest [CapLevel](#) the device qualifies for.
