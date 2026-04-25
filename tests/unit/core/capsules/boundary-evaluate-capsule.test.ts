import { describe, it, expect } from 'vitest';
import { boundaryEvaluateCapsule } from '@czap/core';

describe('boundaryEvaluateCapsule', () => {
  it('declares a pureTransform capsule with content-addressed id', () => {
    expect(boundaryEvaluateCapsule._kind).toBe('pureTransform');
    expect(boundaryEvaluateCapsule.name).toBe('core.boundary.evaluate');
    expect(boundaryEvaluateCapsule.id).toMatch(/^fnv1a:/);
  });

  it('declares zero-alloc budget and node+browser+worker sites', () => {
    expect(boundaryEvaluateCapsule.budgets.allocClass).toBe('zero');
    expect(boundaryEvaluateCapsule.site).toEqual(['node', 'browser', 'worker']);
  });

  it('declares at least one invariant with a name', () => {
    expect(boundaryEvaluateCapsule.invariants.length).toBeGreaterThan(0);
    for (const inv of boundaryEvaluateCapsule.invariants) {
      expect(inv.name).toBeTruthy();
      expect(inv.message).toBeTruthy();
      expect(typeof inv.check).toBe('function');
    }
  });
});
