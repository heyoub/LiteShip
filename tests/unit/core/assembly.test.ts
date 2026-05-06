import { describe, it, expect, beforeEach } from 'vitest';
import { Schema } from 'effect';
import { defineCapsule, getCapsuleCatalog } from '@czap/core';
import { resetCapsuleCatalog } from '@czap/core/testing';

describe('defineCapsule', () => {
  beforeEach(() => resetCapsuleCatalog());

  it('registers a pureTransform capsule and computes a content address', () => {
    const cap = defineCapsule({
      _kind: 'pureTransform',
      name: 'demo.square',
      input: Schema.Number,
      output: Schema.Number,
      capabilities: { reads: [], writes: [] },
      invariants: [],
      budgets: { p95Ms: 1 },
      site: ['node'],
    });
    expect(cap._kind).toBe('pureTransform');
    expect(cap.id).toMatch(/^fnv1a:[0-9a-f]+$/);
    expect(cap.name).toBe('demo.square');
  });

  it('catalog contains every defined capsule', () => {
    defineCapsule({
      _kind: 'pureTransform',
      name: 'demo.square',
      input: Schema.Number,
      output: Schema.Number,
      capabilities: { reads: [], writes: [] },
      invariants: [],
      budgets: { p95Ms: 1 },
      site: ['node'],
    });
    const catalog = getCapsuleCatalog();
    expect(catalog.some((c) => c.name === 'demo.square')).toBe(true);
  });

  it('resetCapsuleCatalog clears the registry', () => {
    defineCapsule({
      _kind: 'pureTransform',
      name: 'demo.a',
      input: Schema.Number,
      output: Schema.Number,
      capabilities: { reads: [], writes: [] },
      invariants: [],
      budgets: { p95Ms: 1 },
      site: ['node'],
    });
    resetCapsuleCatalog();
    expect(getCapsuleCatalog().length).toBe(0);
  });
});
