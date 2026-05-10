[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [vite/src](../README.md) / WASMResolution

# Interface: WASMResolution

Defined in: vite/src/wasm-resolve.ts:19

Successful WASM-resolution result: the absolute binary path plus the
search step that found it (useful for diagnostics).

## Properties

### filePath

> `readonly` **filePath**: `string`

Defined in: vite/src/wasm-resolve.ts:21

Absolute filesystem path to the WASM binary.

***

### source

> `readonly` **source**: `"config"` \| `"crate"` \| `"public"`

Defined in: vite/src/wasm-resolve.ts:23

Which search step matched (`'config'`, `'crate'`, or `'public'`).
