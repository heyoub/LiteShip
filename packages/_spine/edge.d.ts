/**
 * @czap/edge type spine -- CDN-edge tier detection, boundary caching, theme compilation.
 */

import type { CapLevel, ContentAddress } from './core.d.ts';
import type { DeviceCapabilities, DesignTier, MotionTier, ExtendedDeviceCapabilities } from './detect.d.ts';

// ═══════════════════════════════════════════════════════════════════════════════
// § 1. CLIENT HINTS
// ═══════════════════════════════════════════════════════════════════════════════

export interface ClientHintsHeaders {
  readonly 'sec-ch-ua-arch'?: string;
  readonly 'sec-ch-ua-model'?: string;
  readonly 'sec-ch-ua-platform'?: string;
  readonly 'sec-ch-ua-mobile'?: string;
  readonly 'device-memory'?: string;
  readonly 'sec-ch-viewport-width'?: string;
  readonly 'sec-ch-dpr'?: string;
  readonly 'sec-ch-prefers-color-scheme'?: string;
  readonly 'sec-ch-prefers-reduced-motion'?: string;
  readonly 'save-data'?: string;
  readonly 'user-agent'?: string;
}

export declare const ClientHints: {
  parseClientHints(headers: Headers | ClientHintsHeaders): ExtendedDeviceCapabilities;
  acceptCHHeader(): string;
  criticalCHHeader(): string;
};

export declare namespace ClientHints {
  export type Headers = ClientHintsHeaders;
}

// ═══════════════════════════════════════════════════════════════════════════════
// § 2. EDGE TIER
// ═══════════════════════════════════════════════════════════════════════════════

export interface EdgeTierResult {
  readonly capLevel: CapLevel;
  readonly motionTier: MotionTier;
  readonly designTier: DesignTier;
}

export declare const EdgeTier: {
  detectTier(headers: Headers | ClientHintsHeaders): EdgeTierResult;
  tierDataAttributes(result: EdgeTierResult): string;
};

export declare namespace EdgeTier {
  export type Result = EdgeTierResult;
}

// ═══════════════════════════════════════════════════════════════════════════════
// § 3. KV BOUNDARY CACHE
// ═══════════════════════════════════════════════════════════════════════════════

export interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export interface CompiledOutputs {
  readonly css: string;
  readonly propertyRegistrations: string;
  readonly containerQueries: string;
}

export interface BoundaryCache {
  getCompiledOutputs(
    boundaryId: ContentAddress,
    tierResult: EdgeTierResult,
  ): Promise<CompiledOutputs | null>;
  putCompiledOutputs(
    boundaryId: ContentAddress,
    tierResult: EdgeTierResult,
    outputs: CompiledOutputs,
  ): Promise<void>;
}

export declare function createBoundaryCache(kv: KVNamespace, options?: { ttl?: number; prefix?: string }): BoundaryCache;

export declare const KVCache: {
  createBoundaryCache(kv: KVNamespace, options?: { ttl?: number; prefix?: string }): BoundaryCache;
};

// ═══════════════════════════════════════════════════════════════════════════════
// § 4. THEME COMPILER
// ═══════════════════════════════════════════════════════════════════════════════

export interface ThemeCompileConfig {
  readonly themeName: string;
  readonly tokens: Record<string, unknown>;
}

export interface ThemeCompileResult {
  readonly css: string;
  readonly selector: string;
}

export declare function compileTheme(config: ThemeCompileConfig): ThemeCompileResult;

// ═══════════════════════════════════════════════════════════════════════════════
// § 5. EDGE HOST ADAPTER
// ═══════════════════════════════════════════════════════════════════════════════

export interface EdgeHostContext {
  readonly capabilities: ExtendedDeviceCapabilities;
  readonly tier: EdgeTierResult;
}

export interface EdgeHostCompileContext extends EdgeHostContext {
  readonly theme?: ThemeCompileResult;
}

export interface EdgeHostCacheConfig {
  readonly kv: KVNamespace;
  readonly boundaryId: ContentAddress;
  readonly compile: (context: EdgeHostCompileContext) => Promise<CompiledOutputs> | CompiledOutputs;
  readonly ttl?: number;
  readonly prefix?: string;
}

export type EdgeHostCacheStatus = 'disabled' | 'hit' | 'miss';

export interface EdgeHostAdapterConfig {
  readonly theme?:
    | ThemeCompileConfig
    | ((context: EdgeHostContext) => ThemeCompileConfig | null | undefined);
  readonly cache?: EdgeHostCacheConfig;
}

export interface EdgeHostResolution extends EdgeHostContext {
  readonly theme?: ThemeCompileResult;
  readonly compiledOutputs?: CompiledOutputs;
  readonly htmlAttributes: string;
  readonly responseHeaders: {
    readonly acceptCH: string;
    readonly criticalCH: string;
  };
  readonly cacheStatus: EdgeHostCacheStatus;
}

export interface EdgeHostAdapter {
  resolve(headers: Headers | ClientHintsHeaders): Promise<EdgeHostResolution>;
}

export declare function createEdgeHostAdapter(config?: EdgeHostAdapterConfig): EdgeHostAdapter;

export declare const EdgeHostAdapter: {
  create(config?: EdgeHostAdapterConfig): EdgeHostAdapter;
};

export declare namespace EdgeHostAdapter {
  export type Config = EdgeHostAdapterConfig;
  export type Resolution = EdgeHostResolution;
  export type CacheStatus = EdgeHostCacheStatus;
  export type Context = EdgeHostContext;
  export type CompileContext = EdgeHostCompileContext;
}
