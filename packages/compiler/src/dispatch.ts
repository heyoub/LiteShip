/**
 * Compiler dispatch — tagged CompilerDef discriminated union.
 *
 * Zero `unknown`, zero `as` casts. No default case — TypeScript enforces exhaustiveness.
 */

import type { Boundary, Config } from '@czap/core';
import type { CSSCompileResult } from './css.js';
import type { GLSLCompileResult } from './glsl.js';
import type { WGSLCompileResult } from './wgsl.js';
import type { ARIACompileResult } from './aria.js';
import type { AIManifestCompileResult, AIManifest } from './ai-manifest.js';
import { CSSCompiler } from './css.js';
import { GLSLCompiler } from './glsl.js';
import { WGSLCompiler } from './wgsl.js';
import { ARIACompiler } from './aria.js';
import { AIManifestCompiler } from './ai-manifest.js';

// ─────────────────────────────────────────────────────────────────────────────
// Compiler-specific state types
// ─────────────────────────────────────────────────────────────────────────────

/** Per-state CSS property maps keyed by state name (values are CSS strings). */
export type CSSStates = Readonly<Record<string, Readonly<Record<string, string>>>>;
/** Per-state GLSL uniform values keyed by state name (numeric only). */
export type GLSLStates = Readonly<Record<string, Readonly<Record<string, number>>>>;
/** Per-state WGSL uniform values keyed by state name (numeric only). */
export type WGSLStates = Readonly<Record<string, Readonly<Record<string, number>>>>;

/**
 * ARIA compile input — per-state attribute map plus the currently-active state.
 *
 * The compiler emits the attributes for `currentState` (not all states) to
 * avoid flooding the DOM with unused `aria-*` values.
 */
export interface ARIAStates {
  /** Per-state ARIA attribute maps keyed by state name. */
  readonly states: Record<string, Record<string, string>>;
  /** Name of the state whose ARIA attributes should be emitted. */
  readonly currentState: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Config compiler output
// ─────────────────────────────────────────────────────────────────────────────

/** Result of the `ConfigCompiler` arm — pretty-printed JSON of a `czap.config`. */
export interface ConfigTemplateResult {
  /** Pretty-printed JSON string (2-space indent). */
  readonly json: string;
}

const ConfigTemplateCompiler = {
  compile(config: Config.Shape): ConfigTemplateResult {
    return { json: JSON.stringify(config, null, 2) };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// CompilerDef — tagged discriminated union
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tagged discriminated union describing a single compilation request.
 *
 * Every arm carries exactly the inputs its target needs; {@link dispatch}
 * switches on `_tag` with no default case, so TypeScript guarantees
 * exhaustiveness and no runtime `unknown`/`as` casts are required.
 *
 * Arms:
 * - `CSSCompiler`    — boundary + per-state CSS property maps → `@container` rules.
 * - `GLSLCompiler`   — boundary + per-state numeric uniforms → GLSL uniform block.
 * - `WGSLCompiler`   — boundary + per-state numeric uniforms → WGSL bindings.
 * - `ARIACompiler`   — boundary + per-state attribute maps + active state → ARIA attributes.
 * - `AICompiler`     — a prebuilt {@link AIManifest} → tool-call-ready manifest JSON.
 * - `ConfigCompiler` — a `Config.Shape` → pretty-printed JSON template.
 */
export type CompilerDef =
  | { readonly _tag: 'CSSCompiler'; readonly boundary: Boundary.Shape; readonly states: CSSStates }
  | { readonly _tag: 'GLSLCompiler'; readonly boundary: Boundary.Shape; readonly states: GLSLStates }
  | { readonly _tag: 'WGSLCompiler'; readonly boundary: Boundary.Shape; readonly states: WGSLStates }
  | { readonly _tag: 'ARIACompiler'; readonly boundary: Boundary.Shape; readonly states: ARIAStates }
  | { readonly _tag: 'AICompiler'; readonly manifest: AIManifest }
  | { readonly _tag: 'ConfigCompiler'; readonly config: Config.Shape };

// ─────────────────────────────────────────────────────────────────────────────
// CompileResult — discriminated by target string
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tagged compile output returned by {@link dispatch}.
 *
 * `target` discriminates the `result` payload so callers can narrow without
 * casts. The mapping is 1:1 with the arms of {@link CompilerDef}.
 */
export type CompileResult =
  | { readonly target: 'css'; readonly result: CSSCompileResult }
  | { readonly target: 'glsl'; readonly result: GLSLCompileResult }
  | { readonly target: 'wgsl'; readonly result: WGSLCompileResult }
  | { readonly target: 'aria'; readonly result: ARIACompileResult }
  | { readonly target: 'ai'; readonly result: AIManifestCompileResult }
  | { readonly target: 'config'; readonly result: ConfigTemplateResult };

// ─────────────────────────────────────────────────────────────────────────────
// Dispatch
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dispatch a {@link CompilerDef} to the matching compiler and return a
 * tagged {@link CompileResult}.
 *
 * This is the single public entry point for multi-target compilation.
 * The switch has no default case; adding a new arm to {@link CompilerDef}
 * will produce a type error at dispatch.
 *
 * @example
 * ```ts
 * import { Boundary } from '@czap/core';
 * import { dispatch } from '@czap/compiler';
 *
 * const boundary = Boundary.make({
 *   input: 'width', states: ['sm', 'lg'] as const, thresholds: [0, 768],
 * });
 * const result = dispatch({
 *   _tag: 'CSSCompiler',
 *   boundary,
 *   states: { sm: { 'font-size': '14px' }, lg: { 'font-size': '18px' } },
 * });
 * if (result.target === 'css') {
 *   console.log(result.result.raw); // emitted @container rules
 * }
 * ```
 *
 * @param def - The compiler definition arm to dispatch
 * @returns A {@link CompileResult} tagged by target
 */
export function dispatch(def: CompilerDef): CompileResult {
  switch (def._tag) {
    case 'CSSCompiler':
      return { target: 'css', result: CSSCompiler.compile(def.boundary, def.states) };
    case 'GLSLCompiler':
      return { target: 'glsl', result: GLSLCompiler.compile(def.boundary, def.states) };
    case 'WGSLCompiler':
      return { target: 'wgsl', result: WGSLCompiler.compile(def.boundary, def.states) };
    case 'ARIACompiler':
      return { target: 'aria', result: ARIACompiler.compile(def.boundary, def.states.states, def.states.currentState) };
    case 'AICompiler':
      return { target: 'ai', result: AIManifestCompiler.compile(def.manifest) };
    case 'ConfigCompiler':
      return { target: 'config', result: ConfigTemplateCompiler.compile(def.config) };
  }
}
