[**czap**](../../../README.md)

***

[czap](../../../README.md) / [core/src](../README.md) / WASMDispatch

# Variable: WASMDispatch

> `const` **WASMDispatch**: [`WASMDispatchAPI`](../interfaces/WASMDispatchAPI.md)

Defined in: [core/src/wasm-dispatch.ts:226](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/core/src/wasm-dispatch.ts#L226)

WASMDispatch — singleton that wires the Rust compute crate (spring, boundary,
blend kernels) into the runtime, falling back to [fallbackKernels](fallbackKernels.md)
when WebAssembly is unavailable or the module fails to load.
