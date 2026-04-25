import { describe, it, expect } from 'vitest';
import { streamReceiptCapsule } from '@czap/web';

describe('streamReceiptCapsule', () => {
  it('declares a receiptedMutation for the SSE morph+receipt path', () => {
    expect(streamReceiptCapsule._kind).toBe('receiptedMutation');
    expect(streamReceiptCapsule.name).toBe('web.stream.receipt');
    expect(streamReceiptCapsule.capabilities.writes).toContain('dom.morph');
  });

  it('declares node + browser sites for shared receipt semantics', () => {
    expect(streamReceiptCapsule.site).toEqual(['node', 'browser']);
  });

  it('has at least one invariant', () => {
    expect(streamReceiptCapsule.invariants.length).toBeGreaterThan(0);
  });
});
