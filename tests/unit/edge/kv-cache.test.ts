/**
 * KV cache -- content-addressed boundary precomputation cache tests.
 */

import { afterEach, describe, test, expect, vi } from 'vitest';
import { Diagnostics } from '@czap/core';
import { createBoundaryCache } from '@czap/edge';
import type { ContentAddress } from '@czap/core';
import type { KVNamespace } from '@czap/edge';

// Minimal in-memory KV mock
function createMockKV(): KVNamespace & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
  };
}

function createSpyKV(): KVNamespace & {
  readonly get: ReturnType<typeof vi.fn>;
  readonly put: ReturnType<typeof vi.fn>;
} {
  return {
    get: vi.fn(async () => null),
    put: vi.fn(async () => {}),
  };
}

const boundaryId = 'fnv1a:abc12345' as ContentAddress;
const tierResult = {
  capLevel: 'reactive' as const,
  motionTier: 'animations' as const,
  designTier: 'enhanced' as const,
};

afterEach(() => {
  Diagnostics.reset();
});

describe('createBoundaryCache', () => {
  test('getCompiledOutputs returns null on cache miss', async () => {
    const kv = createMockKV();
    const cache = createBoundaryCache(kv);
    const result = await cache.getCompiledOutputs(boundaryId, tierResult);
    expect(result).toBeNull();
  });

  test('putCompiledOutputs then getCompiledOutputs round-trips', async () => {
    const kv = createMockKV();
    const cache = createBoundaryCache(kv);
    const outputs = {
      css: ':root { --czap-scale: 1; }',
      propertyRegistrations: '@property --czap-scale { syntax: "<number>"; }',
      containerQueries: '@container (min-width: 768px) { ... }',
    };

    await cache.putCompiledOutputs(boundaryId, tierResult, outputs);
    const result = await cache.getCompiledOutputs(boundaryId, tierResult);

    expect(result).not.toBeNull();
    expect(result!.css).toBe(outputs.css);
    expect(result!.propertyRegistrations).toBe(outputs.propertyRegistrations);
    expect(result!.containerQueries).toBe(outputs.containerQueries);
  });

  test('different tier results produce different cache keys', async () => {
    const kv = createMockKV();
    const cache = createBoundaryCache(kv);
    const outputs1 = { css: 'a', propertyRegistrations: 'b', containerQueries: 'c' };
    const outputs2 = { css: 'x', propertyRegistrations: 'y', containerQueries: 'z' };

    await cache.putCompiledOutputs(boundaryId, tierResult, outputs1);
    await cache.putCompiledOutputs(
      boundaryId,
      {
        ...tierResult,
        motionTier: 'none' as const,
      },
      outputs2,
    );

    const r1 = await cache.getCompiledOutputs(boundaryId, tierResult);
    const r2 = await cache.getCompiledOutputs(boundaryId, {
      ...tierResult,
      motionTier: 'none' as const,
    });

    expect(r1!.css).toBe('a');
    expect(r2!.css).toBe('x');
  });

  test('custom prefix is used in cache keys', async () => {
    const kv = createMockKV();
    const cache = createBoundaryCache(kv, { prefix: 'myapp' });
    const outputs = { css: 'a', propertyRegistrations: 'b', containerQueries: 'c' };

    await cache.putCompiledOutputs(boundaryId, tierResult, outputs);

    // Verify the key in the underlying store uses the custom prefix
    const keys = Array.from(kv.store.keys());
    expect(keys.length).toBe(1);
    expect(keys[0]!.startsWith('myapp:boundary:')).toBe(true);
  });

  test('getCompiledOutputs handles corrupted JSON gracefully', async () => {
    const kv = createMockKV();
    const cache = createBoundaryCache(kv);
    const { sink, events } = Diagnostics.createBufferSink();
    Diagnostics.setSink(sink);

    // Manually inject bad data
    const key = `czap:boundary:${boundaryId}:${tierResult.motionTier}:${tierResult.designTier}`;
    kv.store.set(key, 'not valid json');

    const result = await cache.getCompiledOutputs(boundaryId, tierResult);
    expect(result).toBeNull();
    expect(events).toEqual([
      expect.objectContaining({
        level: 'warn',
        source: 'czap/edge.kv-cache',
        code: 'invalid-cache-entry',
      }),
    ]);
  });

  test('getCompiledOutputs handles incomplete object gracefully', async () => {
    const kv = createMockKV();
    const cache = createBoundaryCache(kv);

    const key = `czap:boundary:${boundaryId}:${tierResult.motionTier}:${tierResult.designTier}`;
    kv.store.set(key, JSON.stringify({ css: 'only css, missing others' }));

    const result = await cache.getCompiledOutputs(boundaryId, tierResult);
    expect(result).toBeNull();
  });

  test('putCompiledOutputs forwards ttl when configured', async () => {
    const kv = createSpyKV();
    const cache = createBoundaryCache(kv, { ttl: 60 });

    await cache.putCompiledOutputs(boundaryId, tierResult, {
      css: 'a',
      propertyRegistrations: 'b',
      containerQueries: 'c',
    });

    expect(kv.put).toHaveBeenCalledWith(
      `czap:boundary:${boundaryId}:${tierResult.motionTier}:${tierResult.designTier}`,
      JSON.stringify({ css: 'a', propertyRegistrations: 'b', containerQueries: 'c' }),
      { expirationTtl: 60 },
    );
  });

  test('getCompiledOutputs rethrows non-SyntaxError parse failures', async () => {
    const kv = createMockKV();
    const cache = createBoundaryCache(kv);
    const key = `czap:boundary:${boundaryId}:${tierResult.motionTier}:${tierResult.designTier}`;
    kv.store.set(key, '{"css":"ok"}');
    const parseSpy = vi.spyOn(JSON, 'parse').mockImplementation(() => {
      throw new TypeError('parse boom');
    });

    await expect(cache.getCompiledOutputs(boundaryId, tierResult)).rejects.toThrow('parse boom');

    parseSpy.mockRestore();
  });
});
