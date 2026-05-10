/**
 * `@czap/astro` — **LiteShip** on Astro 6: constraint-shaped adaptive
 * projection hosted as islands and directives.
 *
 * Provides the Astro `Integration` that registers `@czap/vite`,
 * injects client tier detection, **rigs** the `client:satellite` directive,
 * and exposes `Satellite` for shells with server-resolved bearings.
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
