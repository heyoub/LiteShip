/**
 * Content-addressed boundary precomputation cache with a generic KV
 * interface -- not coupled to any specific KV provider (Cloudflare,
 * Deno KV, Vercel KV, etc.).
 *
 * Cache keys encode the boundary content address and the two-axis tier
 * result so each tier combination gets its own cached compilation output.
 *
 * @module
 */

import { Diagnostics, type ContentAddress } from '@czap/core';
import type { EdgeTierResult } from './edge-tier.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Minimal KV namespace interface -- compatible with Cloudflare Workers KV,
 * Deno KV, or any adapter that implements get/put with string values.
 */
export interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

/**
 * Precompiled CSS outputs for a single boundary at a given tier.
 */
export interface CompiledOutputs {
  readonly css: string;
  readonly propertyRegistrations: string;
  readonly containerQueries: string;
}

/**
 * Content-addressed cache for boundary compilation results keyed by
 * tier combination.
 */
export interface BoundaryCache {
  getCompiledOutputs(boundaryId: ContentAddress, tierResult: EdgeTierResult): Promise<CompiledOutputs | null>;

  putCompiledOutputs(boundaryId: ContentAddress, tierResult: EdgeTierResult, outputs: CompiledOutputs): Promise<void>;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface CacheOptions {
  readonly ttl?: number;
  readonly prefix?: string;
}

function buildCacheKey(prefix: string, boundaryId: ContentAddress, tierResult: EdgeTierResult): string {
  return `${prefix}:boundary:${boundaryId}:${tierResult.motionTier}:${tierResult.designTier}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a {@link BoundaryCache} backed by the provided KV namespace.
 *
 * Cache keys encode the boundary content address and the two-axis tier
 * result so each tier combination gets its own cached compilation output.
 *
 * @example
 * ```ts
 * import { KVCache } from '@czap/edge';
 * import { ContentAddress } from '@czap/core';
 *
 * const kv = { get: async (k: string) => null, put: async (k: string, v: string) => {} };
 * const cache = KVCache.createBoundaryCache(kv, { ttl: 3600, prefix: 'myapp' });
 *
 * const boundaryId = ContentAddress('fnv1a:abcd1234');
 * const tierResult = {
 *   capLevel: 'reactive',
 *   motionTier: 'transitions',
 *   designTier: 'standard',
 * } as const;
 *
 * // Store compiled outputs
 * await cache.putCompiledOutputs(boundaryId, tierResult, {
 *   css: '...',
 *   propertyRegistrations: '...',
 *   containerQueries: '...',
 * });
 *
 * // Retrieve cached outputs
 * const cached = await cache.getCompiledOutputs(boundaryId, tierResult);
 * ```
 *
 * @param kv      - A generic KV namespace implementing get/put
 * @param options - Optional TTL (seconds) and key prefix configuration
 * @returns A {@link BoundaryCache} instance
 */
export function createBoundaryCache(kv: KVNamespace, options?: CacheOptions): BoundaryCache {
  const prefix = options?.prefix ?? 'czap';
  const ttl = options?.ttl;

  return {
    async getCompiledOutputs(boundaryId: ContentAddress, tierResult: EdgeTierResult): Promise<CompiledOutputs | null> {
      const key = buildCacheKey(prefix, boundaryId, tierResult);
      const raw = await kv.get(key);
      if (raw === null) return null;

      let parsed: unknown;
      let invalidJson = false;
      try {
        parsed = JSON.parse(raw);
      } catch (error) {
        if (error instanceof SyntaxError) {
          invalidJson = true;
          Diagnostics.warnOnce({
            source: 'czap/edge.kv-cache',
            code: 'invalid-cache-entry',
            message: `Boundary cache entry "${key}" could not be parsed and will be treated as a cache miss.`,
            cause: error,
          });
        } else {
          throw error;
        }
      }

      if (invalidJson) {
        return null;
      }

      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'css' in parsed &&
        'propertyRegistrations' in parsed &&
        'containerQueries' in parsed
      ) {
        return {
          css: String(parsed.css),
          propertyRegistrations: String(parsed.propertyRegistrations),
          containerQueries: String(parsed.containerQueries),
        };
      }

      return null;
    },

    async putCompiledOutputs(
      boundaryId: ContentAddress,
      tierResult: EdgeTierResult,
      outputs: CompiledOutputs,
    ): Promise<void> {
      const key = buildCacheKey(prefix, boundaryId, tierResult);
      const value = JSON.stringify({
        css: outputs.css,
        propertyRegistrations: outputs.propertyRegistrations,
        containerQueries: outputs.containerQueries,
      });

      await kv.put(key, value, ttl !== undefined ? { expirationTtl: ttl } : undefined);
    },
  };
}

/**
 * KV cache namespace.
 *
 * Provides a content-addressed boundary precomputation cache backed by a
 * generic KV interface (compatible with Cloudflare Workers KV, Deno KV,
 * Vercel KV, etc.). Cache keys encode the boundary content address and
 * the two-axis tier result (motion + design) so each tier combination
 * gets its own cached CSS compilation output.
 *
 * @example
 * ```ts
 * import { KVCache } from '@czap/edge';
 *
 * const kv = { get: async (k: string) => null, put: async (k: string, v: string) => {} };
 * const cache = KVCache.createBoundaryCache(kv, { ttl: 3600 });
 * const outputs = await cache.getCompiledOutputs(boundaryId, tierResult);
 * if (!outputs) {
 *   await cache.putCompiledOutputs(boundaryId, tierResult, compiled);
 * }
 * ```
 */
export const KVCache = {
  createBoundaryCache,
} as const;
