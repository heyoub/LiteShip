import { describe, it, expect, beforeEach } from 'vitest';
import { Schema } from 'effect';
import { defineCapsule } from '@czap/core';
import { resetCapsuleCatalog } from '@czap/core/testing';
import * as Harness from '@czap/core/harness';

describe('generatePolicyGate', () => {
  beforeEach(() => resetCapsuleCatalog());

  it('emits allow/deny coverage, decision-reason traceability, no-silent-deny', () => {
    const cap = defineCapsule({
      _kind: 'policyGate',
      name: 'demo.canCreate',
      input: Schema.Unknown,
      output: Schema.Unknown,
      capabilities: { reads: [], writes: [] },
      invariants: [],
      budgets: { p95Ms: 1 },
      site: ['node'],
    });
    const { testFile, benchFile } = Harness.generatePolicyGate(cap);
    expect(testFile).toContain('allow branch');
    expect(testFile).toContain('deny branch');
    expect(testFile).toContain('reason chain');
    expect(testFile).toContain('no silent deny');
    expect(benchFile).toContain("bench('demo.canCreate'");
    expect(benchFile).toContain('{ time: 500 }');
  });
});
