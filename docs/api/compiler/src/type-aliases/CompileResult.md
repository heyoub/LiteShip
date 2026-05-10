[**LiteShip**](../../../README.md)

***

[LiteShip](../../../modules.md) / [compiler/src](../README.md) / CompileResult

# Type Alias: CompileResult

> **CompileResult** = \{ `result`: [`CSSCompileResult`](../interfaces/CSSCompileResult.md); `target`: `"css"`; \} \| \{ `result`: [`GLSLCompileResult`](../interfaces/GLSLCompileResult.md); `target`: `"glsl"`; \} \| \{ `result`: [`WGSLCompileResult`](../interfaces/WGSLCompileResult.md); `target`: `"wgsl"`; \} \| \{ `result`: [`ARIACompileResult`](../interfaces/ARIACompileResult.md); `target`: `"aria"`; \} \| \{ `result`: [`AIManifestCompileResult`](../interfaces/AIManifestCompileResult.md); `target`: `"ai"`; \} \| \{ `result`: [`ConfigTemplateResult`](../interfaces/ConfigTemplateResult.md); `target`: `"config"`; \}

Defined in: [compiler/src/dispatch.ts:96](https://github.com/TheFreeBatteryFactory/czap/blob/main/packages/compiler/src/dispatch.ts#L96)

Tagged compile output returned by [dispatch](../functions/dispatch.md).

`target` discriminates the `result` payload so callers can narrow without
casts. The mapping is 1:1 with the arms of [CompilerDef](CompilerDef.md).
