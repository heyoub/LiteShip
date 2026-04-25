[**czap**](../../../README.md)

***

[czap](../../../README.md) / [edge/src](../README.md) / EdgeHostCompileContext

# Interface: EdgeHostCompileContext

Defined in: [edge/src/host-adapter.ts:42](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/edge/src/host-adapter.ts#L42)

Compile-time context passed to [EdgeHostCacheConfig.compile](EdgeHostCacheConfig.md#compile).

Extends [EdgeHostContext](EdgeHostContext.md) with the already-resolved theme result
(if any) so host compile callbacks can inject theme tokens into the
compiled per-state outputs without recomputation.

## Extends

- [`EdgeHostContext`](EdgeHostContext.md)

## Properties

### capabilities

> `readonly` **capabilities**: [`ExtendedDeviceCapabilities`](#)

Defined in: [edge/src/host-adapter.ts:30](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/edge/src/host-adapter.ts#L30)

Capabilities parsed from Client Hints.

#### Inherited from

[`EdgeHostContext`](EdgeHostContext.md).[`capabilities`](EdgeHostContext.md#capabilities)

***

### theme?

> `readonly` `optional` **theme?**: [`ThemeCompileResult`](ThemeCompileResult.md)

Defined in: [edge/src/host-adapter.ts:44](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/edge/src/host-adapter.ts#L44)

Pre-compiled theme output, if the adapter resolved one for this request.

***

### tier

> `readonly` **tier**: [`EdgeTierResult`](EdgeTierResult.md)

Defined in: [edge/src/host-adapter.ts:32](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/edge/src/host-adapter.ts#L32)

Derived tier triple (cap, motion, design).

#### Inherited from

[`EdgeHostContext`](EdgeHostContext.md).[`tier`](EdgeHostContext.md#tier)
