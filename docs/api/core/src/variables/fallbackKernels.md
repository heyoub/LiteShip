[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [core/src](../README.md) / fallbackKernels

# Variable: fallbackKernels

> `const` **fallbackKernels**: [`WASMKernels`](../interfaces/WASMKernels.md)

Defined in: core/src/wasm-fallback.ts:98

Pure-JS implementation of the [WASMKernels](../interfaces/WASMKernels.md) contract.

Selected automatically by [WASMDispatch](WASMDispatch.md) when the Rust compute crate
cannot be instantiated (e.g. missing `WebAssembly`, CSP restrictions, or
startup failure). Produces results bit-identical to the WASM build within
IEEE-754 precision limits.
