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

  it('receipt-accompanies-every-mutation invariant accepts applied with receipt and rejects malformed', () => {
    const inv = streamReceiptCapsule.invariants.find(
      (i) => i.name === 'receipt-accompanies-every-mutation',
    );
    expect(inv).toBeDefined();
    // Skipped/failed mutations don't need a string messageId — invariant trivially passes.
    expect(
      inv!.check(
        { kind: 'patch', payload: {} },
        { status: 'skipped', receipt: { messageId: '', appliedAt: 0 } },
      ),
    ).toBe(true);
    expect(
      inv!.check(
        { kind: 'signal', payload: null },
        { status: 'failed', receipt: { messageId: '', appliedAt: 0 } },
      ),
    ).toBe(true);
    // Applied requires a string messageId.
    expect(
      inv!.check(
        { kind: 'patch', payload: {} },
        { status: 'applied', receipt: { messageId: 'abc-123', appliedAt: 1 } },
      ),
    ).toBe(true);
    expect(
      inv!.check(
        { kind: 'patch', payload: {} },
        // Wrong type for messageId — invariant must reject.
        { status: 'applied', receipt: { messageId: 42 as unknown as string, appliedAt: 1 } },
      ),
    ).toBe(false);
  });
});
