[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [core/src](../README.md) / WASMDispatchAPI

# Interface: WASMDispatchAPI

Defined in: [core/src/wasm-dispatch.ts:205](https://github.com/heyoub/LiteShip/blob/main/packages/core/src/wasm-dispatch.ts#L205)

Public API of the [WASMDispatch](../variables/WASMDispatch.md) singleton: probe for WebAssembly,
asynchronously load the Rust compute module, and hand back either WASM or
[fallbackKernels](../variables/fallbackKernels.md) via [WASMDispatchAPI.kernels](#kernels).

## Methods

### detect()

> **detect**(): `boolean`

Defined in: [core/src/wasm-dispatch.ts:206](https://github.com/heyoub/LiteShip/blob/main/packages/core/src/wasm-dispatch.ts#L206)

#### Returns

`boolean`

***

### isLoaded()

> **isLoaded**(): `boolean`

Defined in: [core/src/wasm-dispatch.ts:209](https://github.com/heyoub/LiteShip/blob/main/packages/core/src/wasm-dispatch.ts#L209)

#### Returns

`boolean`

***

### kernels()

> **kernels**(): [`WASMKernels`](WASMKernels.md)

Defined in: [core/src/wasm-dispatch.ts:208](https://github.com/heyoub/LiteShip/blob/main/packages/core/src/wasm-dispatch.ts#L208)

#### Returns

[`WASMKernels`](WASMKernels.md)

***

### load()

> **load**(`wasmUrl`): `Promise`\<[`WASMKernels`](WASMKernels.md)\>

Defined in: [core/src/wasm-dispatch.ts:207](https://github.com/heyoub/LiteShip/blob/main/packages/core/src/wasm-dispatch.ts#L207)

#### Parameters

##### wasmUrl

`string` \| `ArrayBuffer`

#### Returns

`Promise`\<[`WASMKernels`](WASMKernels.md)\>

***

### unload()

> **unload**(): `void`

Defined in: [core/src/wasm-dispatch.ts:210](https://github.com/heyoub/LiteShip/blob/main/packages/core/src/wasm-dispatch.ts#L210)

#### Returns

`void`
