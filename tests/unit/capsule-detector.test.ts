/**
 * Verifies the type-directed capsule detector finds both direct
 * defineCapsule calls and factory-wrapped capsule calls.
 *
 * @module
 */

import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { detectCapsuleCalls, WORKSPACE_ALIASES } from '../../scripts/lib/capsule-detector.js';
import { Config } from '@czap/core';

// Each test creates a ts.Program (transitively loads workspace .ts files
// + node_modules .d.ts), which can take >5s in the shared vitest worker
// pool. Bump the per-test timeout so these don't flake under load.
describe('detectCapsuleCalls', { timeout: 30_000 }, () => {
  it('detects direct defineCapsule calls (pureTransform arm)', () => {
    const calls = detectCapsuleCalls([
      resolve('packages/core/src/capsules/canonical-cbor.ts'),
    ]);
    const match = calls.find((c) => c.name === 'core.canonical-cbor');
    expect(match).toBeDefined();
    expect(match?.kind).toBe('pureTransform');
    expect(match?.factory).toBeUndefined();
  });

  it('detects defineAsset factory calls in examples/scenes/assets.ts', () => {
    const calls = detectCapsuleCalls([resolve('examples/scenes/assets.ts')]);
    const assetCalls = calls.filter((c) => c.factory === 'defineAsset');
    expect(assetCalls.length).toBeGreaterThan(0);
    expect(assetCalls[0]!.kind).toBe('cachedProjection');
  });

  it('detects BeatMarkerProjection factory calls and extracts string literal args', () => {
    const calls = detectCapsuleCalls([resolve('examples/scenes/assets.ts')]);
    const beat = calls.find((c) => c.factory === 'BeatMarkerProjection');
    expect(beat).toBeDefined();
    expect(beat?.kind).toBe('cachedProjection');
    expect(beat?.args).toEqual(expect.arrayContaining(['intro-bed']));
    // The factory's first string argument is also surfaced as the name.
    expect(beat?.name).toBe('intro-bed');
  });

  it('records line numbers and absolute file paths', () => {
    const target = resolve('packages/core/src/capsules/canonical-cbor.ts');
    const calls = detectCapsuleCalls([target]);
    const match = calls.find((c) => c.name === 'core.canonical-cbor');
    expect(match?.file).toBe(target);
    expect(match?.line).toBeGreaterThan(0);
  });

  it('dedupes nested defineCapsule calls inside factory bodies', () => {
    // The factory implementation files (beat-markers.ts, ...) themselves
    // contain a `defineCapsule({...})` call inside the factory function. When
    // those modules are part of the program, that inner call resolves to
    // CapsuleDef and should be reported exactly once per file:line.
    const calls = detectCapsuleCalls([
      resolve('packages/assets/src/analysis/beat-markers.ts'),
    ]);
    const lines = calls.map((c) => `${c.file}:${c.line}`);
    expect(new Set(lines).size).toBe(lines.length);
  });

  it('WORKSPACE_ALIASES is in sync with Config.toTestAliases (no drift)', () => {
    // The detector maintains its own alias map because it bootstraps a
    // TypeScript program; Config.toTestAliases drives the vitest runner.
    // Both MUST list the same @czap/* entries or future package additions
    // will silently skip type resolution in one context or the other.
    const canonical = Object.keys(Config.toTestAliases(Config.make({}), process.cwd()));
    const detector = Object.keys(WORKSPACE_ALIASES);
    expect(new Set(detector)).toEqual(new Set(canonical));
  });
});
