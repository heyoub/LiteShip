import { describe, it, expect, beforeEach } from 'vitest';
import { Schema } from 'effect';
import { defineCapsule, resetCapsuleCatalog, Harness } from '@czap/core';

describe('generateStateMachine', () => {
  beforeEach(() => resetCapsuleCatalog());

  it('emits illegal-transition, replay, invariant-preservation tests', () => {
    const cap = defineCapsule({
      _kind: 'stateMachine',
      name: 'demo.tokenBuffer',
      input: Schema.Unknown,
      output: Schema.Unknown,
      capabilities: { reads: [], writes: [] },
      invariants: [],
      budgets: { p95Ms: 1 },
      site: ['node'],
    });
    const { testFile, benchFile } = Harness.generateStateMachine(cap);
    expect(testFile).toContain('illegal transition');
    expect(testFile).toContain('replay');
    expect(testFile).toContain('invariant holds');
    expect(benchFile).toContain("bench('demo.tokenBuffer'");
    expect(benchFile).toContain('{ time: 500 }');
  });
});
