[**czap**](../../README.md)

***

[czap](../../README.md) / compiler/src

# compiler/src

`@czap/compiler` -- Multi-target output generation from BoundaryDefs.

Takes boundary definitions and state-specific output values,
compiles to target-specific output formats (CSS, GLSL, WGSL, ARIA, AI).

## Interfaces

- [AIAction](interfaces/AIAction.md)
- [AIConstraint](interfaces/AIConstraint.md)
- [AIDimension](interfaces/AIDimension.md)
- [AIManifest](interfaces/AIManifest.md)
- [AIManifestCompileResult](interfaces/AIManifestCompileResult.md)
- [AIParamSchema](interfaces/AIParamSchema.md)
- [AISlot](interfaces/AISlot.md)
- [AIToolDefinition](interfaces/AIToolDefinition.md)
- [ARIACompileResult](interfaces/ARIACompileResult.md)
- [ARIAStates](interfaces/ARIAStates.md)
- [CompileAIManifestInput](interfaces/CompileAIManifestInput.md)
- [ConfigTemplateResult](interfaces/ConfigTemplateResult.md)
- [CSSCompileResult](interfaces/CSSCompileResult.md)
- [CSSContainerRule](interfaces/CSSContainerRule.md)
- [CSSRule](interfaces/CSSRule.md)
- [GLSLCompileResult](interfaces/GLSLCompileResult.md)
- [GLSLDefine](interfaces/GLSLDefine.md)
- [GLSLUniform](interfaces/GLSLUniform.md)
- [McpCommandDescriptor](interfaces/McpCommandDescriptor.md)
- [StyleCSSResult](interfaces/StyleCSSResult.md)
- [ThemeCSSResult](interfaces/ThemeCSSResult.md)
- [TokenCSSResult](interfaces/TokenCSSResult.md)
- [TokenJSResult](interfaces/TokenJSResult.md)
- [TokenTailwindResult](interfaces/TokenTailwindResult.md)
- [WGSLBinding](interfaces/WGSLBinding.md)
- [WGSLCompileResult](interfaces/WGSLCompileResult.md)
- [WGSLStruct](interfaces/WGSLStruct.md)

## Type Aliases

- [CompilerDef](type-aliases/CompilerDef.md)
- [CompileResult](type-aliases/CompileResult.md)
- [CSSStates](type-aliases/CSSStates.md)
- [GLSLStates](type-aliases/GLSLStates.md)
- [GLSLType](type-aliases/GLSLType.md)
- [WGSLStates](type-aliases/WGSLStates.md)
- [WGSLType](type-aliases/WGSLType.md)

## Variables

- [AIManifestCompiler](variables/AIManifestCompiler.md)
- [ARIACompiler](variables/ARIACompiler.md)
- [ComponentCSSCompiler](variables/ComponentCSSCompiler.md)
- [CSSCompiler](variables/CSSCompiler.md)
- [GLSLCompiler](variables/GLSLCompiler.md)
- [StyleCSSCompiler](variables/StyleCSSCompiler.md)
- [ThemeCSSCompiler](variables/ThemeCSSCompiler.md)
- [TokenCSSCompiler](variables/TokenCSSCompiler.md)
- [TokenJSCompiler](variables/TokenJSCompiler.md)
- [TokenTailwindCompiler](variables/TokenTailwindCompiler.md)
- [WGSLCompiler](variables/WGSLCompiler.md)

## Functions

- [compileAIManifest](functions/compileAIManifest.md)
- [dispatch](functions/dispatch.md)
- [generatePropertyRegistrations](functions/generatePropertyRegistrations.md)
