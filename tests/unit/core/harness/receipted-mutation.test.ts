import { describe, it, expect, beforeEach } from 'vitest';
import { Schema } from 'effect';
import { defineCapsule, resetCapsuleCatalog, Harness } from '@czap/core';

describe('generateReceiptedMutation', () => {
  beforeEach(() => resetCapsuleCatalog());

  it('emits contract, fault-injection, idempotency, and audit tests', () => {
    const cap = defineCapsule({
      _kind: 'receiptedMutation',
      name: 'demo.issueReceipt',
      input: Schema.String,
      output: Schema.Struct({ status: Schema.String }),
      capabilities: { reads: [], writes: ['ledger.entries'] },
      invariants: [],
      budgets: { p95Ms: 5 },
      site: ['node'],
    });
    const { testFile, benchFile } = Harness.generateReceiptedMutation(cap);
    expect(testFile).toContain('contract shape');
    expect(testFile).toContain('idempotent');
    expect(testFile).toContain('emits audit receipt');
    expect(testFile).toContain('fault injection');
    expect(benchFile).toContain("bench('demo.issueReceipt'");
  });
});
