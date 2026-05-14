/**
 * `@czap/compiler` — **CZAP** projection targets: turns boundary definitions
 * and per-bearing values into **cast** output (CSS, GLSL, WGSL, ARIA, AI, …).
 *
 * @module
 */

export { CSSCompiler, generatePropertyRegistrations } from './css.js';
export type { CSSRule, CSSContainerRule, CSSCompileResult } from './css.js';

export { GLSLCompiler } from './glsl.js';
export type { GLSLType, GLSLUniform, GLSLDefine, GLSLCompileResult } from './glsl.js';

export { WGSLCompiler } from './wgsl.js';
export type { WGSLType, WGSLBinding, WGSLStruct, WGSLCompileResult } from './wgsl.js';

export { ARIACompiler } from './aria.js';
export type { ARIACompileResult } from './aria.js';

export { AIManifestCompiler, compileAIManifest } from './ai-manifest.js';
export type {
  AIManifest,
  AIDimension,
  AISlot,
  AIAction,
  AIParamSchema,
  AIConstraint,
  AIToolDefinition,
  AIManifestCompileResult,
  McpCommandDescriptor,
  CompileAIManifestInput,
} from './ai-manifest.js';

export { dispatch } from './dispatch.js';
export type {
  CompileResult,
  CompilerDef,
  CSSStates,
  GLSLStates,
  WGSLStates,
  ARIAStates,
  ConfigTemplateResult,
} from './dispatch.js';

export { TokenCSSCompiler } from './token-css.js';
export type { TokenCSSResult } from './token-css.js';

export { TokenTailwindCompiler } from './token-tailwind.js';
export type { TokenTailwindResult } from './token-tailwind.js';

export { TokenJSCompiler } from './token-js.js';
export type { TokenJSResult } from './token-js.js';

export { ThemeCSSCompiler } from './theme-css.js';
export type { ThemeCSSResult } from './theme-css.js';

export { StyleCSSCompiler } from './style-css.js';
export type { StyleCSSResult } from './style-css.js';

export { ComponentCSSCompiler } from './component-css.js';
