import { describe, it, expect, beforeEach } from 'vitest';
import { Schema } from 'effect';
import { defineCapsule, resetCapsuleCatalog, Harness } from '@czap/core';

describe('generateSiteAdapter', () => {
  beforeEach(() => resetCapsuleCatalog());

  it('emits round-trip + host-capability matrix tests', () => {
    const cap = defineCapsule({
      _kind: 'siteAdapter',
      name: 'demo.remotionShim',
      input: Schema.Unknown,
      output: Schema.Unknown,
      capabilities: { reads: [], writes: [] },
      invariants: [],
      budgets: { p95Ms: 1 },
      site: ['node'],
    });
    const { testFile, benchFile } = Harness.generateSiteAdapter(cap);
    expect(testFile).toContain('round-trip equality');
    expect(testFile).toContain('host capability');
    expect(benchFile).toContain("bench('demo.remotionShim'");
    expect(benchFile).toContain('{ time: 500 }');
  });
});
