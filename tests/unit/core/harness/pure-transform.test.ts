import { describe, it, expect, beforeEach } from 'vitest';
import { Schema } from 'effect';
import { defineCapsule, resetCapsuleCatalog, Harness } from '@czap/core';

describe('generatePureTransformHarness', () => {
  beforeEach(() => resetCapsuleCatalog());

  it('emits a property test wired to the binding when a HarnessContext is supplied', () => {
    const cap = defineCapsule({
      _kind: 'pureTransform',
      name: 'demo.double',
      input: Schema.Number,
      output: Schema.Number,
      capabilities: { reads: [], writes: [] },
      invariants: [{ name: 'idempotent-on-zero', check: (i: number, o: number) => i !== 0 || o === 0, message: '' }],
      budgets: { p95Ms: 1 },
      site: ['node'],
    });
    const { testFile, benchFile } = Harness.generatePureTransform(cap, {
      bindingImport: '../../packages/demo/src/double.js',
      bindingName: 'doubleCapsule',
      arbitraryImport: '../../packages/core/src/harness/arbitrary-from-schema.js',
    });
    expect(testFile).toContain("describe('demo.double'");
    expect(testFile).toContain('fc.assert');
    expect(testFile).toContain('schemaToArbitrary');
    expect(testFile).toContain('doubleCapsule');
    expect(testFile).toContain("from '../../packages/demo/src/double.js'");
    expect(benchFile).toContain("bench('demo.double'");
  });

  it('emits an honest it.skip placeholder when no binding context is supplied', () => {
    const cap = defineCapsule({
      _kind: 'pureTransform',
      name: 'demo.double',
      input: Schema.Number,
      output: Schema.Number,
      capabilities: { reads: [], writes: [] },
      invariants: [{ name: 'idempotent-on-zero', check: (i: number, o: number) => i !== 0 || o === 0, message: '' }],
      budgets: { p95Ms: 1 },
      site: ['node'],
    });
    const { testFile } = Harness.generatePureTransform(cap);
    expect(testFile).toContain('it.skip');
    expect(testFile).not.toContain('fc.assert');
    expect(testFile).toContain('TODO(harness)');
  });
});
