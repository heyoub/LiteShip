import { describe, it, expect, beforeEach } from 'vitest';
import { Schema } from 'effect';
import { defineCapsule, resetCapsuleCatalog, Harness } from '@czap/core';

describe('generateSceneComposition', () => {
  beforeEach(() => resetCapsuleCatalog());

  it('emits determinism, sync-accuracy, per-frame budget, playback-invariant tests', () => {
    const cap = defineCapsule({
      _kind: 'sceneComposition',
      name: 'demo.intro',
      input: Schema.Unknown,
      output: Schema.Unknown,
      capabilities: { reads: [], writes: [] },
      invariants: [],
      budgets: { p95Ms: 16 },
      site: ['node', 'browser'],
    });
    const { testFile, benchFile } = Harness.generateSceneComposition(cap);
    expect(testFile).toContain('determinism');
    expect(testFile).toContain('sync accuracy');
    expect(testFile).toContain('per-frame budget');
    expect(testFile).toContain('invariant');
    expect(benchFile).toContain("bench('demo.intro");
    expect(benchFile).toContain('{ time: 2000 }');
  });
});
