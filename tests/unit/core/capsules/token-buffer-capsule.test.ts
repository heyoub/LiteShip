import { describe, it, expect } from 'vitest';
import { tokenBufferCapsule } from '@czap/core';

describe('tokenBufferCapsule', () => {
  it('declares a stateMachine for the LLM token buffer', () => {
    expect(tokenBufferCapsule._kind).toBe('stateMachine');
    expect(tokenBufferCapsule.name).toBe('core.token-buffer');
  });

  it('declares bounded allocation class for zero-GC hot path', () => {
    expect(tokenBufferCapsule.budgets.allocClass).toBe('bounded');
  });

  it('has at least two invariants', () => {
    expect(tokenBufferCapsule.invariants.length).toBeGreaterThanOrEqual(2);
  });

  it('phase-matches-content rejects empty-buffer-while-buffering', () => {
    const inv = tokenBufferCapsule.invariants.find((i) => i.name === 'phase-matches-content');
    expect(inv).toBeDefined();
    // Empty + buffering → invalid.
    expect(
      inv!.check({ _tag: 'reset' }, { phase: 'buffering', tokens: [], totalBytes: 0 }),
    ).toBe(false);
    // Empty + idle → ok.
    expect(
      inv!.check({ _tag: 'reset' }, { phase: 'idle', tokens: [], totalBytes: 0 }),
    ).toBe(true);
    // Non-empty + buffering → ok.
    expect(
      inv!.check({ _tag: 'push', token: 'a' }, { phase: 'buffering', tokens: ['a'], totalBytes: 1 }),
    ).toBe(true);
  });

  it('totalBytes-tracks-tokens rejects mismatched byte total', () => {
    const inv = tokenBufferCapsule.invariants.find((i) => i.name === 'totalBytes-tracks-tokens');
    expect(inv).toBeDefined();
    expect(
      inv!.check(undefined, { tokens: ['ab', 'c'], totalBytes: 3 }),
    ).toBe(true);
    expect(
      inv!.check(undefined, { tokens: ['ab', 'c'], totalBytes: 5 }),
    ).toBe(false);
    expect(
      inv!.check(undefined, { tokens: [], totalBytes: 0 }),
    ).toBe(true);
  });
});
