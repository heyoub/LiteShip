/**
 * `@czap/edge` -- Edge pipeline for server-side tier detection, boundary
 * caching, and theme compilation.
 *
 * Parses HTTP Client Hints headers into device capabilities, maps them
 * to the same tier lattice used on the client, and provides helpers for
 * HTML injection, KV-backed boundary caching, and per-tenant theme
 * compilation.
 *
 * @module
 */

export { ClientHints } from './client-hints.js';
export type { ClientHintsHeaders } from './client-hints.js';

export { EdgeTier } from './edge-tier.js';
export type { EdgeTierResult } from './edge-tier.js';

export { createBoundaryCache, KVCache } from './kv-cache.js';
export type { KVNamespace, BoundaryCache, CompiledOutputs } from './kv-cache.js';

export { compileTheme } from './theme-compiler.js';
export type { ThemeCompileConfig, ThemeCompileResult } from './theme-compiler.js';

export { createEdgeHostAdapter, EdgeHostAdapter } from './host-adapter.js';
export type {
  EdgeHostAdapterConfig,
  EdgeHostResolution,
  EdgeHostCacheConfig,
  EdgeHostCacheStatus,
  EdgeHostContext,
  EdgeHostCompileContext,
} from './host-adapter.js';
