[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [core/src](../README.md) / WASMDispatchAPI

# Interface: WASMDispatchAPI

Defined in: core/src/wasm-dispatch.ts:208

Public API of the [WASMDispatch](../variables/WASMDispatch.md) singleton: probe for WebAssembly,
asynchronously load the Rust compute module, and hand back either WASM or
[fallbackKernels](../variables/fallbackKernels.md) via [WASMDispatchAPI.kernels](#kernels).

## Methods

### detect()

> **detect**(): `boolean`

Defined in: core/src/wasm-dispatch.ts:209

#### Returns

`boolean`

***

### isLoaded()

> **isLoaded**(): `boolean`

Defined in: core/src/wasm-dispatch.ts:212

#### Returns

`boolean`

***

### kernels()

> **kernels**(): [`WASMKernels`](WASMKernels.md)

Defined in: core/src/wasm-dispatch.ts:211

#### Returns

[`WASMKernels`](WASMKernels.md)

***

### load()

> **load**(`wasmUrl`): `Promise`\<[`WASMKernels`](WASMKernels.md)\>

Defined in: core/src/wasm-dispatch.ts:210

#### Parameters

##### wasmUrl

`string` \| `ArrayBuffer`

#### Returns

`Promise`\<[`WASMKernels`](WASMKernels.md)\>

***

### unload()

> **unload**(): `void`

Defined in: core/src/wasm-dispatch.ts:213

#### Returns

`void`
