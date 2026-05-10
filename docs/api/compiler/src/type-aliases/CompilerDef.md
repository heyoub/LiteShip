[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [compiler/src](../README.md) / CompilerDef

# Type Alias: CompilerDef

> **CompilerDef** = \{ `_tag`: `"CSSCompiler"`; `boundary`: [`Boundary.Shape`](#); `states`: [`CSSStates`](CSSStates.md); \} \| \{ `_tag`: `"GLSLCompiler"`; `boundary`: [`Boundary.Shape`](#); `states`: [`GLSLStates`](GLSLStates.md); \} \| \{ `_tag`: `"WGSLCompiler"`; `boundary`: [`Boundary.Shape`](#); `states`: [`WGSLStates`](WGSLStates.md); \} \| \{ `_tag`: `"ARIACompiler"`; `boundary`: [`Boundary.Shape`](#); `states`: [`ARIAStates`](../interfaces/ARIAStates.md); \} \| \{ `_tag`: `"AICompiler"`; `manifest`: [`AIManifest`](../interfaces/AIManifest.md); \} \| \{ `_tag`: `"ConfigCompiler"`; `config`: `Config.Shape`; \}

Defined in: compiler/src/dispatch.ts:78

Tagged discriminated union describing a single compilation request.

Every arm carries exactly the inputs its target needs; [dispatch](../functions/dispatch.md)
switches on `_tag` with no default case, so TypeScript guarantees
exhaustiveness and no runtime `unknown`/`as` casts are required.

Arms:
- `CSSCompiler`    — boundary + per-state CSS property maps → `@container` rules.
- `GLSLCompiler`   — boundary + per-state numeric uniforms → GLSL uniform block.
- `WGSLCompiler`   — boundary + per-state numeric uniforms → WGSL bindings.
- `ARIACompiler`   — boundary + per-state attribute maps + active state → ARIA attributes.
- `AICompiler`     — a prebuilt [AIManifest](../interfaces/AIManifest.md) → tool-call-ready manifest JSON.
- `ConfigCompiler` — a `Config.Shape` → pretty-printed JSON template.
