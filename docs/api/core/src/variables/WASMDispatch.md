[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [core/src](../README.md) / WASMDispatch

# Variable: WASMDispatch

> `const` **WASMDispatch**: [`WASMDispatchAPI`](../interfaces/WASMDispatchAPI.md)

Defined in: [core/src/wasm-dispatch.ts:223](https://github.com/heyoub/LiteShip/blob/main/packages/core/src/wasm-dispatch.ts#L223)

WASMDispatch — singleton that wires the Rust compute crate (spring, boundary,
blend kernels) into the runtime, falling back to [fallbackKernels](fallbackKernels.md)
when WebAssembly is unavailable or the module fails to load.
