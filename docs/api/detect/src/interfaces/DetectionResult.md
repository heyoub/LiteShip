[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [detect/src](../README.md) / DetectionResult

# Interface: DetectionResult

Defined in: detect/src/detect.ts:102

Result of a single detection sweep.

Bundles the probed capabilities together with the derived [CapLevel](#)
tier, its monotone [CapSet](#), and a confidence score reflecting how
many probes returned real values (vs. defaults).

## Extended by

- [`ExtendedDetectionResult`](ExtendedDetectionResult.md)

## Properties

### capabilities

> `readonly` **capabilities**: [`DeviceCapabilities`](DeviceCapabilities.md)

Defined in: detect/src/detect.ts:104

The probed capabilities.

***

### capSet

> `readonly` **capSet**: [`CapSet`](#)

Defined in: detect/src/detect.ts:108

Monotone set of every [CapLevel](#) at or below `tier`.

***

### confidence

> `readonly` **confidence**: `number`

Defined in: detect/src/detect.ts:110

Heuristic confidence in `[0.5, 1]` based on how many probes succeeded.

***

### tier

> `readonly` **tier**: [`CapLevel`](#)

Defined in: detect/src/detect.ts:106

Highest [CapLevel](#) the device qualifies for.
