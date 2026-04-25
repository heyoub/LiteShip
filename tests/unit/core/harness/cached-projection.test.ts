import { describe, it, expect, beforeEach } from 'vitest';
import { Schema } from 'effect';
import { defineCapsule, resetCapsuleCatalog, Harness } from '@czap/core';

describe('generateCachedProjection', () => {
  beforeEach(() => resetCapsuleCatalog());

  it('emits cache-hit equality, invalidation, decode-throughput bench', () => {
    const cap = defineCapsule({
      _kind: 'cachedProjection',
      name: 'demo.audioDecode',
      input: Schema.Unknown,
      output: Schema.Unknown,
      capabilities: { reads: ['fs.read'], writes: [] },
      invariants: [],
      budgets: { p95Ms: 50 },
      site: ['node'],
    });
    const { testFile, benchFile } = Harness.generateCachedProjection(cap);
    expect(testFile).toContain('cache hit');
    expect(testFile).toContain('invalidation');
    expect(benchFile).toContain('decode throughput');
    expect(benchFile).toContain("bench('demo.audioDecode");
    expect(benchFile).toContain('{ time: 500 }');
  });
});
