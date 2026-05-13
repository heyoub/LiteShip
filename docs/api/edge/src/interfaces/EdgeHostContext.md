[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [edge/src](../README.md) / EdgeHostContext

# Interface: EdgeHostContext

Defined in: [edge/src/host-adapter.ts:28](https://github.com/heyoub/LiteShip/blob/main/packages/edge/src/host-adapter.ts#L28)

Detected device context available to host callbacks before compile.

Pairs the parsed [ExtendedDeviceCapabilities](#) with the resolved
[EdgeTierResult](EdgeTierResult.md) so a host can derive a theme config or compile
decision without re-parsing headers.

## Extended by

- [`EdgeHostResolution`](EdgeHostResolution.md)
- [`EdgeHostCompileContext`](EdgeHostCompileContext.md)

## Properties

### capabilities

> `readonly` **capabilities**: [`ExtendedDeviceCapabilities`](#)

Defined in: [edge/src/host-adapter.ts:30](https://github.com/heyoub/LiteShip/blob/main/packages/edge/src/host-adapter.ts#L30)

Capabilities parsed from Client Hints.

***

### tier

> `readonly` **tier**: [`EdgeTierResult`](EdgeTierResult.md)

Defined in: [edge/src/host-adapter.ts:32](https://github.com/heyoub/LiteShip/blob/main/packages/edge/src/host-adapter.ts#L32)

Derived tier triple (cap, motion, design).
