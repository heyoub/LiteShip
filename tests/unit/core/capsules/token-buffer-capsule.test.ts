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
});
