/**
 * EdgeHostAdapter -- canonical host-facing edge resolution path.
 *
 * Resolves client hints, tiering, optional theme compilation, and optional
 * boundary compilation cache lookups in a single host-level operation.
 *
 * @module
 */

import type { ContentAddress } from '@czap/core';
import type { ExtendedDeviceCapabilities } from '@czap/detect';
import { ClientHints } from './client-hints.js';
import type { ClientHintsHeaders } from './client-hints.js';
import { EdgeTier } from './edge-tier.js';
import type { EdgeTierResult } from './edge-tier.js';
import { createBoundaryCache } from './kv-cache.js';
import type { CompiledOutputs, KVNamespace } from './kv-cache.js';
import { compileTheme } from './theme-compiler.js';
import type { ThemeCompileConfig, ThemeCompileResult } from './theme-compiler.js';

/**
 * Detected device context available to host callbacks before compile.
 *
 * Pairs the parsed {@link ExtendedDeviceCapabilities} with the resolved
 * {@link EdgeTierResult} so a host can derive a theme config or compile
 * decision without re-parsing headers.
 */
export interface EdgeHostContext {
  /** Capabilities parsed from Client Hints. */
  readonly capabilities: ExtendedDeviceCapabilities;
  /** Derived tier triple (cap, motion, design). */
  readonly tier: EdgeTierResult;
}

/**
 * Compile-time context passed to {@link EdgeHostCacheConfig.compile}.
 *
 * Extends {@link EdgeHostContext} with the already-resolved theme result
 * (if any) so host compile callbacks can inject theme tokens into the
 * compiled per-state outputs without recomputation.
 */
export interface EdgeHostCompileContext extends EdgeHostContext {
  /** Pre-compiled theme output, if the adapter resolved one for this request. */
  readonly theme?: ThemeCompileResult;
}

/**
 * Cache configuration for the edge host adapter.
 *
 * When set, per-boundary compiled outputs are memoized in the supplied KV
 * namespace keyed by `(boundaryId, tier)`. `compile` is the user-provided
 * function that produces the outputs on a cache miss; its result is
 * written back to KV with the configured `ttl`.
 */
export interface EdgeHostCacheConfig {
  /** KV namespace backing the boundary cache. */
  readonly kv: KVNamespace;
  /** Content address of the boundary being compiled. */
  readonly boundaryId: ContentAddress;
  /** Compile function invoked on cache miss. */
  readonly compile: (context: EdgeHostCompileContext) => Promise<CompiledOutputs> | CompiledOutputs;
  /** Cache entry TTL in seconds. */
  readonly ttl?: number;
  /** Optional KV key prefix. */
  readonly prefix?: string;
}

/**
 * Configuration for {@link createEdgeHostAdapter}.
 *
 * `theme` may be a static {@link ThemeCompileConfig}, a per-request
 * resolver function, or absent. `cache` enables a KV-backed boundary
 * compile cache keyed by content address + tier.
 */
export interface EdgeHostAdapterConfig {
  /** Static theme config, or a resolver invoked with each request's context. */
  readonly theme?: ThemeCompileConfig | ((context: EdgeHostContext) => ThemeCompileConfig | null | undefined);
  /** KV-backed boundary output cache; omit to disable caching. */
  readonly cache?: EdgeHostCacheConfig;
}

/** Cache lookup outcome reported in {@link EdgeHostResolution}. */
export type EdgeHostCacheStatus = 'disabled' | 'hit' | 'miss';

/**
 * Full per-request resolution output from {@link EdgeHostAdapter.resolve}.
 *
 * Carries the device context, optional theme and compiled outputs, the
 * `data-czap-*` attribute string for the root HTML element, and the
 * `Accept-CH`/`Critical-CH` headers the response should send back.
 */
export interface EdgeHostResolution extends EdgeHostContext {
  /** Compiled theme result, if a theme config was resolved for this request. */
  readonly theme?: ThemeCompileResult;
  /** Compiled per-state outputs for the configured boundary, if caching is enabled. */
  readonly compiledOutputs?: CompiledOutputs;
  /** `data-czap-cap`/`data-czap-motion`/`data-czap-design` string for `<html>`. */
  readonly htmlAttributes: string;
  /** Response headers to send back so the browser will supply hints next time. */
  readonly responseHeaders: {
    /** `Accept-CH` header value. */
    readonly acceptCH: string;
    /** `Critical-CH` header value. */
    readonly criticalCH: string;
  };
  /** Whether the boundary outputs came from cache, were computed and stored, or caching is off. */
  readonly cacheStatus: EdgeHostCacheStatus;
}

/**
 * Opaque host-facing adapter returned by {@link createEdgeHostAdapter}.
 *
 * Call `resolve(headers)` per request; the adapter drives tier detection,
 * theme compilation, and boundary caching in a single pass.
 */
export interface EdgeHostAdapter {
  /** Resolve a request's device context, theme, and compiled outputs. */
  resolve(headers: Headers | ClientHintsHeaders): Promise<EdgeHostResolution>;
}

function resolveThemeConfig(
  theme: EdgeHostAdapterConfig['theme'],
  context: EdgeHostContext,
): ThemeCompileConfig | null | undefined {
  if (typeof theme === 'function') {
    return theme(context);
  }
  return theme;
}

/**
 * Create an {@link EdgeHostAdapter} with optional theme and boundary cache.
 *
 * The returned adapter is designed to be instantiated once per worker and
 * reused across requests; it caches a compiled static theme eagerly and
 * only invokes the compile callback on cache miss when caching is enabled.
 */
export function createEdgeHostAdapter(config: EdgeHostAdapterConfig = {}): EdgeHostAdapter {
  let boundaryCache: ReturnType<typeof createBoundaryCache> | null = null;
  if (config.cache) {
    boundaryCache = createBoundaryCache(config.cache.kv, {
      ttl: config.cache.ttl,
      prefix: config.cache.prefix,
    });
  }
  const staticThemeConfig = typeof config.theme === 'function' ? undefined : config.theme;
  let compiledStaticTheme: ThemeCompileResult | undefined;
  if (staticThemeConfig) {
    compiledStaticTheme = compileTheme(staticThemeConfig);
  }
  const responseHeaders = {
    acceptCH: ClientHints.acceptCHHeader(),
    criticalCH: ClientHints.criticalCHHeader(),
  } as const;

  return {
    async resolve(headers: Headers | ClientHintsHeaders): Promise<EdgeHostResolution> {
      const capabilities = ClientHints.parseClientHints(headers);
      const tier = EdgeTier.detectTier(headers);
      const context: EdgeHostContext = { capabilities, tier };
      const themeConfig = compiledStaticTheme ? undefined : resolveThemeConfig(config.theme, context);
      let theme = compiledStaticTheme;
      if (!theme && themeConfig) {
        theme = compileTheme(themeConfig);
      }

      let compiledOutputs: CompiledOutputs | undefined;
      let cacheStatus: EdgeHostCacheStatus = boundaryCache ? 'miss' : 'disabled';

      if (boundaryCache && config.cache) {
        const cached = await boundaryCache.getCompiledOutputs(config.cache.boundaryId, tier);
        if (cached) {
          compiledOutputs = cached;
          cacheStatus = 'hit';
        } else {
          compiledOutputs = await config.cache.compile({ capabilities, tier, theme });
          await boundaryCache.putCompiledOutputs(config.cache.boundaryId, tier, compiledOutputs);
        }
      }

      return {
        capabilities,
        tier,
        theme,
        compiledOutputs,
        htmlAttributes: EdgeTier.tierDataAttributes(tier),
        responseHeaders,
        cacheStatus,
      };
    },
  };
}

/**
 * Edge host adapter namespace.
 *
 * `EdgeHostAdapter.create(config)` builds a reusable adapter that resolves
 * Client Hints, tiers, theme compilation, and KV-backed boundary caching
 * in a single per-request pass.
 */
export const EdgeHostAdapter = {
  /** Alias for {@link createEdgeHostAdapter}. */
  create: createEdgeHostAdapter,
} as const;

export declare namespace EdgeHostAdapter {
  /** Alias for {@link EdgeHostAdapterConfig}. */
  export type Config = EdgeHostAdapterConfig;
  /** Alias for {@link EdgeHostResolution}. */
  export type Resolution = EdgeHostResolution;
  /** Alias for {@link EdgeHostCacheStatus}. */
  export type CacheStatus = EdgeHostCacheStatus;
  /** Alias for {@link EdgeHostContext}. */
  export type Context = EdgeHostContext;
  /** Alias for {@link EdgeHostCompileContext}. */
  export type CompileContext = EdgeHostCompileContext;
}
