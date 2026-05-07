[**czap**](../../README.md)

***

[czap](../../README.md) / vite/src

# vite/src

`@czap/vite` -- Vite 8 plugin that turns `@czap` CSS at-rule blocks
into native CSS and wires HMR for czap primitives.

The plugin hooks into Vite's `resolveId`, `load`, `transform`, and
`handleHotUpdate` phases:

- `resolveId` + `load`: map `virtual:czap/*` specifiers to generated
  modules (device capabilities, WASM URL, ...).
- `transform`: rewrite `@token`, `@theme`, `@style`, and `@quantize`
  at-rule blocks into native CSS (custom properties,
  `html[data-theme]` selectors, scoped `@layer` / `@scope` rules,
  and `@container` queries).
- `handleHotUpdate`: emit surgical HMR payloads so CSS variables,
  shader uniforms, and boundary definitions update without a full
  page reload.

## Example

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { plugin as czap } from '@czap/vite';

const config = defineConfig({
  plugins: [czap({ themes: ['./themes/default.ts'] })],
});
```

## Interfaces

- [HMRPayload](interfaces/HMRPayload.md)
- [PluginConfig](interfaces/PluginConfig.md)
- [PrimitiveResolution](interfaces/PrimitiveResolution.md)
- [QuantizeBlock](interfaces/QuantizeBlock.md)
- [StyleBlock](interfaces/StyleBlock.md)
- [ThemeBlock](interfaces/ThemeBlock.md)
- [TokenBlock](interfaces/TokenBlock.md)
- [WASMResolution](interfaces/WASMResolution.md)

## Type Aliases

- [PrimitiveKind](type-aliases/PrimitiveKind.md)
- [PrimitiveShape](type-aliases/PrimitiveShape.md)
- [VirtualModuleId](type-aliases/VirtualModuleId.md)

## Functions

- [compileQuantizeBlock](functions/compileQuantizeBlock.md)
- [compileStyleBlock](functions/compileStyleBlock.md)
- [compileThemeBlock](functions/compileThemeBlock.md)
- [compileTokenBlock](functions/compileTokenBlock.md)
- [handleHMR](functions/handleHMR.md)
- [isVirtualId](functions/isVirtualId.md)
- [loadVirtualModule](functions/loadVirtualModule.md)
- [parseQuantizeBlocks](functions/parseQuantizeBlocks.md)
- [parseStyleBlocks](functions/parseStyleBlocks.md)
- [parseThemeBlocks](functions/parseThemeBlocks.md)
- [parseTokenBlocks](functions/parseTokenBlocks.md)
- [plugin](functions/plugin.md)
- [resolvePrimitive](functions/resolvePrimitive.md)
- [resolveVirtualId](functions/resolveVirtualId.md)
- [resolveWASM](functions/resolveWASM.md)
- [transformHTML](functions/transformHTML.md)
