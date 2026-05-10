[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [core/src](../README.md) / WASMKernels

# Interface: WASMKernels

Defined in: [core/src/wasm-dispatch.ts:24](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/wasm-dispatch.ts#L24)

Kernel functions available from both WASM and TS fallback.

## Methods

### batchBoundaryEval()

> **batchBoundaryEval**(`thresholds`, `values`): `Uint32Array`

Defined in: [core/src/wasm-dispatch.ts:36](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/wasm-dispatch.ts#L36)

Batch boundary evaluation. For each value, returns the index of the
highest threshold where `value >= threshold`.
Thresholds must be sorted ascending.

#### Parameters

##### thresholds

`Float64Array`

##### values

`Float64Array`

#### Returns

`Uint32Array`

***

### blendNormalize()

> **blendNormalize**(`weights`): `Float32Array`

Defined in: [core/src/wasm-dispatch.ts:42](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/wasm-dispatch.ts#L42)

Normalize weights in-place so positive values sum to 1.0.
Negative weights clamped to 0. Returns the (modified) input array.

#### Parameters

##### weights

`Float32Array`

#### Returns

`Float32Array`

***

### springCurve()

> **springCurve**(`stiffness`, `damping`, `mass`, `samples`): `Float32Array`

Defined in: [core/src/wasm-dispatch.ts:29](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/wasm-dispatch.ts#L29)

Sample a spring easing at `samples` evenly-spaced points in [0, 1].
Returns Float32Array of length `samples + 1`.

#### Parameters

##### stiffness

`number`

##### damping

`number`

##### mass

`number`

##### samples

`number`

#### Returns

`Float32Array`
