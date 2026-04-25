/**
 * `@czap/astro` -- Astro 6 integration for constraint-based adaptive
 * rendering.
 *
 * Provides the Astro `Integration` that registers the `@czap/vite`
 * plugin, injects the client-side tier-detection script, wires the
 * `client:satellite` directive, and exposes the `Satellite` component
 * for server islands with client-side state resolution.
 *
 * @example
 * ```ts
 * // astro.config.mjs
 * import { defineConfig } from 'astro/config';
 * import { integration as czap } from '@czap/astro';
 *
 * const config = defineConfig({
 *   integrations: [czap({ themes: ['./themes/default.ts'] })],
 * });
 * ```
 *
 * @module
 */

export type { IntegrationConfig } from './integration.js';
export { integration } from './integration.js';
export type { ServerIslandContext, QuantizeProps } from './quantize.js';
export { resolveInitialState } from './quantize.js';
export { satelliteAttrs, resolveInitialStateFallback } from './Satellite.js';
export type { SatelliteProps } from './Satellite.js';
export { czapMiddleware } from './middleware.js';
export type { CzapLocals, CzapMiddlewareConfig } from './middleware.js';
