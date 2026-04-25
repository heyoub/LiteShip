/**
 * `@czap/vite` -- Vite 8 plugin that turns `@czap` CSS at-rule blocks
 * into native CSS and wires HMR for czap primitives.
 *
 * The plugin hooks into Vite's `resolveId`, `load`, `transform`, and
 * `handleHotUpdate` phases:
 *
 * - `resolveId` + `load`: map `virtual:czap/*` specifiers to generated
 *   modules (device capabilities, WASM URL, ...).
 * - `transform`: rewrite `@token`, `@theme`, `@style`, and `@quantize`
 *   at-rule blocks into native CSS (custom properties,
 *   `html[data-theme]` selectors, scoped `@layer` / `@scope` rules,
 *   and `@container` queries).
 * - `handleHotUpdate`: emit surgical HMR payloads so CSS variables,
 *   shader uniforms, and boundary definitions update without a full
 *   page reload.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { defineConfig } from 'vite';
 * import { plugin as czap } from '@czap/vite';
 *
 * const config = defineConfig({
 *   plugins: [czap({ themes: ['./themes/default.ts'] })],
 * });
 * ```
 *
 * @module
 */

// Plugin
export type { PluginConfig } from './plugin.js';
export { plugin } from './plugin.js';
export { resolveWASM } from './wasm-resolve.js';
export type { WASMResolution } from './wasm-resolve.js';

// @quantize
export type { QuantizeBlock } from './css-quantize.js';
export { parseQuantizeBlocks, compileQuantizeBlock } from './css-quantize.js';

// @token
export type { TokenBlock } from './token-transform.js';
export { parseTokenBlocks, compileTokenBlock } from './token-transform.js';

// @theme
export type { ThemeBlock } from './theme-transform.js';
export { parseThemeBlocks, compileThemeBlock } from './theme-transform.js';

// @style
export type { StyleBlock } from './style-transform.js';
export { parseStyleBlocks, compileStyleBlock } from './style-transform.js';

// HTML transform
export { transformHTML } from './html-transform.js';

// Virtual modules
export type { VirtualModuleId } from './virtual-modules.js';
export { resolveVirtualId, isVirtualId, loadVirtualModule } from './virtual-modules.js';

// HMR
export type { HMRPayload } from './hmr.js';
export { handleHMR } from './hmr.js';

// Generic primitive resolution
export type { PrimitiveKind, PrimitiveResolution, PrimitiveShape } from './primitive-resolve.js';
export { resolvePrimitive, KIND_META } from './primitive-resolve.js';
